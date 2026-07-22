/** Photography frame for product UI — ratio, loading veil, optional risk overlay. */
import type { ReactNode, ImgHTMLAttributes } from 'react'

type Props = {
  src: string
  alt: string
  ratio?: '1/1' | '4/3' | '16/9' | '3/4'
  loading?: boolean
  className?: string
  overlay?: ReactNode
  imgProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>
  onErrorSrc?: string
}

export function PhotoFrame({
  src,
  alt,
  ratio = '1/1',
  loading = false,
  className = '',
  overlay,
  imgProps,
  onErrorSrc,
}: Props) {
  const aspect =
    ratio === '1/1'
      ? '1 / 1'
      : ratio === '4/3'
        ? '4 / 3'
        : ratio === '16/9'
          ? '16 / 9'
          : '3 / 4'

  return (
    <div
      className={`photo-frame ${loading ? 'photo-frame--loading' : ''} ${className}`.trim()}
      style={{ aspectRatio: aspect }}
    >
      <img
        src={src}
        alt={alt}
        loading={imgProps?.loading ?? 'lazy'}
        decoding="async"
        {...imgProps}
        onError={(e) => {
          if (onErrorSrc && e.currentTarget.src !== onErrorSrc) {
            e.currentTarget.src = onErrorSrc
          }
          imgProps?.onError?.(e)
        }}
      />
      {overlay ? <div className="photo-frame__overlay">{overlay}</div> : null}
    </div>
  )
}
