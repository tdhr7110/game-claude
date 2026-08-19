import { useState } from 'react';

interface CollectionArtImageProps {
  url: string | null;
  fallbackIcon: string;
  fallbackColor?: string;
  alt: string;
  className?: string;
}

// 図鑑アイコン画像の共通表示コンポーネント。
// url が無い(=未登録画像)場合、または実際の読み込みに失敗した場合は、
// 常に既存のアイコン絵文字表示へフォールバックする(欠損時に表示が壊れることはない)。
export function CollectionArtImage({ url, fallbackIcon, fallbackColor, alt, className }: CollectionArtImageProps) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <span className={className} style={{ color: fallbackColor }} role="img" aria-label={alt}>
        {fallbackIcon}
      </span>
    );
  }

  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} draggable={false} />;
}
