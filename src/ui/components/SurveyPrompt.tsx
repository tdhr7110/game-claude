import { useState } from 'react';
import { recordSurvey } from '../../metrics/metricsRecorder';
import type { SurveyResponse } from '../../metrics/types';

// ラン終了時の任意アンケート(TEST12)。回答は必須ではなく、送信しなくても他の操作は妨げない。
// 回答内容はブラウザ内の計測データにのみ保存され、外部へは送信しない。
const FUN_OPTIONS: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
const REPLAY_OPTIONS: { value: SurveyResponse['wantsReplay']; label: string }[] = [
  { value: 'yes', label: 'また遊びたい' },
  { value: 'unsure', label: 'どちらとも言えない' },
  { value: 'no', label: 'あまり遊びたくない' },
];

export function SurveyPrompt() {
  const [fun, setFun] = useState<SurveyResponse['fun']>(null);
  const [confusingPoint, setConfusingPoint] = useState('');
  const [wantsReplay, setWantsReplay] = useState<SurveyResponse['wantsReplay']>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <div className="survey-box survey-box--done">🙏 アンケートへのご協力ありがとうございました</div>;
  }

  function handleSubmit() {
    recordSurvey({ fun, confusingPoint: confusingPoint.trim().slice(0, 200), wantsReplay, answeredAt: Date.now() });
    setSubmitted(true);
  }

  const hasAnyAnswer = fun !== null || confusingPoint.trim() !== '' || wantsReplay !== null;

  return (
    <div className="survey-box">
      <div className="survey-box__title">📝 アンケート(任意・すべて未回答でも構いません)</div>

      <div className="survey-box__row">
        <label>楽しさ</label>
        <div className="survey-box__stars">
          {FUN_OPTIONS.map((v) => (
            <button key={v} type="button" className={`btn btn--small${fun === v ? ' btn--primary' : ''}`} onClick={() => setFun(fun === v ? null : v)}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="survey-box__row">
        <label htmlFor="survey-confusing">分かりにくかった場所</label>
        <input
          id="survey-confusing"
          type="text"
          className="survey-box__input"
          maxLength={200}
          placeholder="例: 部位の効果が分かりにくかった"
          value={confusingPoint}
          onChange={(e) => setConfusingPoint(e.target.value)}
        />
      </div>

      <div className="survey-box__row">
        <label>もう一度遊びたいか</label>
        <div className="survey-box__row-buttons">
          {REPLAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn btn--small${wantsReplay === opt.value ? ' btn--primary' : ''}`}
              onClick={() => setWantsReplay(wantsReplay === opt.value ? null : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="survey-box__row">
        <button className="btn btn--primary btn--small" disabled={!hasAnyAnswer} onClick={handleSubmit}>
          送信する
        </button>
        <button className="btn btn--ghost btn--small" onClick={() => setSubmitted(true)}>
          回答しない
        </button>
      </div>
    </div>
  );
}
