/**
 * 录音波形动画组件 — 模拟音频波形可视化
 * 使用 React Native Animated API 实现动态波形效果
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface WaveformProps {
  isActive: boolean;    // 是否正在录音
  barCount?: number;    // 波形条数
  barWidth?: number;    // 每条宽度
  maxHeight?: number;   // 最大高度
  color?: string;       // 颜色
}

export default function Waveform({
  isActive,
  barCount = 20,
  barWidth = 3,
  maxHeight = 40,
  color = theme.colors.secondary,
}: WaveformProps) {
  const animations = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(4))
  ).current;

  useEffect(() => {
    if (isActive) {
      const loopAnimations = animations.map((anim, i) => {
        // 随机化每根柱子的动画参数
        const randomDuration = 300 + Math.random() * 400;
        const randomHeight = 8 + Math.random() * (maxHeight - 8);
        const randomDelay = Math.random() * 200;

        return Animated.loop(
          Animated.sequence([
            Animated.delay(randomDelay),
            Animated.timing(anim, {
              toValue: randomHeight,
              duration: randomDuration,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 4 + Math.random() * 6,
              duration: randomDuration * 0.8,
              useNativeDriver: false,
            }),
          ])
        );
      });

      loopAnimations.forEach(a => a.start());

      return () => {
        loopAnimations.forEach(a => a.stop());
      };
    } else {
      // 停止时平滑归位
      animations.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 4,
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isActive]);

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              width: barWidth,
              height: anim,
              backgroundColor: color,
              opacity: isActive ? 0.6 + Math.random() * 0.4 : 0.3,
              marginHorizontal: 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  bar: {
    borderRadius: 2,
  },
});
