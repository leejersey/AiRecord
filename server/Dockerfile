FROM python:3.11-slim

WORKDIR /app

# 系统依赖（pydub 需要 ffmpeg）
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用代码
COPY app/ ./app/

# 创建上传目录和数据库目录
RUN mkdir -p /app/uploads /app/data

# 环境变量（运行时通过 .env 或 docker-compose 覆盖）
ENV PYTHONUNBUFFERED=1
ENV UPLOAD_DIR=/app/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
