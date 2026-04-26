"""
火山引擎 ASR 服务 — 录音文件识别极速版

API 文档: https://www.volcengine.com/docs/6561/80818
使用 HTTP 直连方式调用，无需安装 SDK
"""
import httpx
import json
import os
import gzip
import base64
import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)

# 火山引擎语音识别 API 端点
ASR_API_URL = "https://openspeech.bytedance.com/api/v1/asr"


async def transcribe_audio(audio_path: str) -> dict:
    """
    调用火山引擎一句话识别

    Args:
        audio_path: 音频文件路径

    Returns:
        {
            "transcript": "全文文本",
            "utterances": [{"text": "...", "start_time": 0.0, "end_time": 1.5}, ...]
        }
    """
    settings = get_settings()

    # Web 端录音为 webm 格式，需要转码为 wav
    actual_path = audio_path
    if audio_path.endswith(".webm"):
        actual_path = await _convert_webm_to_wav(audio_path)

    # 获取音频时长
    duration = await _get_audio_duration(actual_path)
    logger.info(f"音频时长: {duration:.1f}s, 文件: {actual_path}")

    MAX_CHUNK_SECONDS = 25  # 火山引擎限制单包 ≤ 30s，留 5s 余量

    if duration <= MAX_CHUNK_SECONDS:
        # 短音频：直接识别
        return await _transcribe_chunk(actual_path, audio_path, settings, 0.0)
    else:
        # 长音频：分片识别后合并
        chunks = await _split_audio(actual_path, MAX_CHUNK_SECONDS)
        logger.info(f"长音频分片: {len(chunks)} 片")

        all_transcript = ""
        all_utterances = []
        offset = 0.0

        for i, chunk_path in enumerate(chunks):
            try:
                result = await _transcribe_chunk(chunk_path, f"{audio_path}_chunk{i}", settings, offset)
                all_transcript += result["transcript"]
                all_utterances.extend(result["utterances"])
                chunk_dur = await _get_audio_duration(chunk_path)
                offset += chunk_dur
            except Exception as e:
                logger.warning(f"分片 {i} 转写失败: {e}")
            finally:
                # 清理分片临时文件
                try:
                    os.remove(chunk_path)
                except OSError:
                    pass

        return {"transcript": all_transcript, "utterances": all_utterances}


async def _transcribe_chunk(audio_path: str, reqid_seed: str, settings, time_offset: float = 0.0) -> dict:
    """识别单个音频片段（≤ 30s）"""
    with open(audio_path, "rb") as f:
        audio_data = f.read()

    audio_b64 = base64.b64encode(audio_data).decode("utf-8")

    final_body = {
        "app": {
            "appid": settings.volcano_app_id,
            "token": settings.volcano_access_key,
            "cluster": "volcengine_streaming_common",
        },
        "user": {
            "uid": "airecord_user",
        },
        "audio": {
            "format": _get_audio_format(audio_path),
            "bits": 16,
            "channel": 1,
            "rate": 16000,
            "language": "zh-CN",
            "data": audio_b64,
        },
        "request": {
            "reqid": hashlib.md5(reqid_seed.encode()).hexdigest(),
            "sequence": -1,
            "nbest": 1,
            "show_utterances": True,
            "enable_itn": True,           # 逆文本正则化（数字、日期等规范化）
            "enable_punc": True,           # 智能标点
            "result_type": "full",         # 返回完整结果
        },
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer; {settings.volcano_access_key}",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                ASR_API_URL,
                json=final_body,
                headers=headers,
            )
            response.raise_for_status()
            result = response.json()

        parsed = _parse_asr_result(result)
        # 为分片结果添加时间偏移
        if time_offset > 0:
            for u in parsed["utterances"]:
                u["start_time"] += time_offset
                u["end_time"] += time_offset
        return parsed

    except httpx.HTTPStatusError as e:
        logger.error(f"ASR API HTTP 错误: {e.response.status_code} - {e.response.text}")
        raise RuntimeError(f"ASR 服务返回错误: {e.response.status_code}")
    except Exception as e:
        logger.error(f"ASR 调用异常: {str(e)}")
        raise RuntimeError(f"ASR 转写失败: {str(e)}")

def _find_ffmpeg() -> str:
    """查找 ffmpeg 可执行文件"""
    import shutil
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]:
            if os.path.isfile(candidate):
                ffmpeg_bin = candidate
                break
    if not ffmpeg_bin:
        raise RuntimeError("未找到 ffmpeg，请确认已安装并在 PATH 中")
    return ffmpeg_bin


def _find_ffprobe() -> str:
    """查找 ffprobe 可执行文件"""
    import shutil
    ffprobe_bin = shutil.which("ffprobe")
    if not ffprobe_bin:
        for candidate in ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"]:
            if os.path.isfile(candidate):
                ffprobe_bin = candidate
                break
    if not ffprobe_bin:
        raise RuntimeError("未找到 ffprobe，请确认已安装并在 PATH 中")
    return ffprobe_bin


async def _get_audio_duration(audio_path: str) -> float:
    """获取音频文件时长（秒）"""
    import asyncio
    ffprobe_bin = _find_ffprobe()
    proc = await asyncio.create_subprocess_exec(
        ffprobe_bin, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", audio_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    try:
        return float(stdout.decode().strip())
    except ValueError:
        return 0.0


async def _split_audio(audio_path: str, chunk_seconds: int) -> list[str]:
    """将音频文件按指定秒数切片（在静音处切割避免切断词语）"""
    import asyncio
    import glob
    ffmpeg_bin = _find_ffmpeg()
    base = audio_path.rsplit(".", 1)[0]
    ext = audio_path.rsplit(".", 1)[1]
    pattern = f"{base}_chunk%03d.{ext}"

    # 使用 segment_time 配合 break_non_keyframes 在更自然的位置切割
    proc = await asyncio.create_subprocess_exec(
        ffmpeg_bin, "-y", "-i", audio_path,
        "-f", "segment",
        "-segment_time", str(chunk_seconds),
        "-break_non_keyframes", "1",
        "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
        pattern,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()

    # 收集生成的分片文件
    chunks = sorted(glob.glob(f"{base}_chunk*.{ext}"))
    return chunks


async def _convert_webm_to_wav(webm_path: str) -> str:
    """将 webm 格式转换为 wav（用于 ASR）"""
    import asyncio
    ffmpeg_bin = _find_ffmpeg()

    wav_path = webm_path.rsplit(".", 1)[0] + ".wav"
    try:
        proc = await asyncio.create_subprocess_exec(
            ffmpeg_bin, "-y", "-i", webm_path, "-ar", "16000", "-ac", "1", wav_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg 转码失败，返回码: {proc.returncode}")
        logger.info(f"webm → wav 转码完成: {wav_path}")
        return wav_path
    except FileNotFoundError:
        raise RuntimeError("未安装 ffmpeg，无法转码 webm 音频文件")


def _get_audio_format(audio_path: str) -> str:
    """根据文件扩展名推断音频格式"""
    ext = audio_path.rsplit(".", 1)[-1].lower()
    format_map = {
        "wav": "wav",
        "mp3": "mp3",
        "m4a": "m4a",
        "aac": "aac",
        "ogg": "ogg",
        "flac": "flac",
        "webm": "wav",  # webm 会先转为 wav
    }
    return format_map.get(ext, "wav")


def _parse_asr_result(result: dict) -> dict:
    """
    解析火山引擎 ASR 返回结果为统一格式

    注意: 实际字段根据火山引擎文档调整。这里做了容错处理，
    确保即使返回格式变化也不会崩溃。
    """
    transcript = ""
    utterances = []

    try:
        # 火山引擎常见的返回格式
        if "result" in result:
            res = result["result"]
            if isinstance(res, list):
                for item in res:
                    text = item.get("text", "")
                    transcript += text
                    utterances.append({
                        "text": text,
                        "start_time": item.get("start_time", 0) / 1000.0,  # ms → s
                        "end_time": item.get("end_time", 0) / 1000.0,
                    })
            elif isinstance(res, dict):
                transcript = res.get("text", "")
        elif "payload_msg" in result:
            payload = result["payload_msg"]
            if "result" in payload:
                for item in payload["result"]:
                    text = item.get("text", "")
                    transcript += text
                    utterances.append({
                        "text": text,
                        "start_time": item.get("start_time", 0) / 1000.0,
                        "end_time": item.get("end_time", 0) / 1000.0,
                    })
    except (KeyError, TypeError) as e:
        logger.warning(f"ASR 结果解析异常，使用原始数据: {e}")
        transcript = json.dumps(result, ensure_ascii=False)

    return {
        "transcript": transcript,
        "utterances": utterances,
    }
