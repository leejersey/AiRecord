import axios from 'axios';
import { Platform } from 'react-native';

/**
 * API 配置 — 自动切换开发/生产环境
 *
 * 环境判断逻辑:
 * 1. __DEV__ = true  → 本地开发（Expo 开发服务器）
 * 2. __DEV__ = false → 生产环境（指向服务器）
 */

// 开发环境：局域网 IP（Mac 的本地 IP）
const LOCAL_IP = '192.168.1.109';
const DEV_API_URL = Platform.OS === 'web'
  ? 'http://localhost:8000/api'
  : `http://${LOCAL_IP}:8000/api`;

// 生产环境：服务器地址
const PROD_API_URL = 'http://119.91.198.219/api';

// 自动选择
const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

console.log(`📡 API → ${API_URL} (${__DEV__ ? 'DEV' : 'PROD'})`);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60s（AI 分析可能需要较长时间）
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器（日志）
api.interceptors.request.use(
  (config) => {
    if (__DEV__) {
      console.log(`→ ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  }
);

// 响应拦截器（统一错误处理）
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.detail || error.message;

    if (__DEV__) {
      console.error(`← ${status || 'ERR'}: ${message}`);
    }

    return Promise.reject(error);
  }
);

/**
 * 获取完整的后端 URL（用于音频流、导出等直接访问场景）
 */
export function getBaseUrl(): string {
  return API_URL.replace('/api', '');
}
