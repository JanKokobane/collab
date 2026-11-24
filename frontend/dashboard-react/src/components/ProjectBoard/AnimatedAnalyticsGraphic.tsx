import React from 'react';
import styles from './AnimatedAnalyticsGraphic.module.css';

export const AnimatedAnalyticsGraphic: React.FC = () => (
  <div
    className={styles['analytics-graphic']}
    role="img"
    aria-label="Animated analytics illustration with a trend line, bars, and donut chart"
  >
    <div className={`${styles['grid-card']} ${styles['grid-card-back']}`} />
    <div className={`${styles['grid-card']} ${styles['grid-card-front']}`} />
    <svg className={styles['paperclip']} viewBox="0 0 16 24" aria-hidden="true">
      <path d="M5 5v12a3 3 0 0 0 6 0V4a4 4 0 0 0-8 0v13a5 5 0 0 0 10 0V7" />
    </svg>

    <div className={styles['trend-card']}>
      <svg className={styles['trend-line']} viewBox="0 0 58 34" aria-hidden="true">
        <defs>
          <linearGradient id="analytics-line-gradient" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
        </defs>
        <path d="M3 29 C14 27 16 23 25 21 S38 14 43 12 S51 7 55 3" />
        <path className={styles['trend-arrow']} d="m48 4 8-2-2 8" />
      </svg>
      <span className={styles['star-badge']} aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M10 1.5 12.2 7.8 18.5 10l-6.3 2.2L10 18.5l-2.2-6.3L1.5 10l6.3-2.2L10 1.5Z" />
        </svg>
      </span>
    </div>

    <div className={styles['bar-chart']} aria-hidden="true">
      <span className={styles['chart-wick']} />
      <span className={`${styles['chart-bar']} ${styles['chart-bar-one']}`} />
      <span className={styles['chart-wick']} />
      <span className={`${styles['chart-bar']} ${styles['chart-bar-two']}`} />
      <span className={styles['chart-wick']} />
      <span className={`${styles['chart-bar']} ${styles['chart-bar-three']}`} />
    </div>

    <div className={styles['donut-chart']} aria-hidden="true" />

    <div className={styles['toggle-track']} aria-hidden="true">
      <span className={styles['toggle-knob']}>
        <svg viewBox="0 0 20 20">
          <path d="M10 1.5 12.2 7.8 18.5 10l-6.3 2.2L10 18.5l-2.2-6.3L1.5 10l6.3-2.2L10 1.5Z" />
        </svg>
      </span>
    </div>
  </div>
);
