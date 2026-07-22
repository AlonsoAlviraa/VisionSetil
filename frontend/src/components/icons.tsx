/**
 * Clean SVG icon set for VisionSetil — no emoji chrome.
 * Stroke icons match the atelier product language.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

function base(props: IconProps) {
  const { size = 24, className, ...rest } = props
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: className ? `vs-icon ${className}` : 'vs-icon',
    'aria-hidden': true as const,
    ...rest,
  }
}

/** Classic mushroom silhouette — brand mark */
export function IconMushroom(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 11c0-4.2 3.4-7.5 7.5-7.5s7.5 3.3 7.5 7.5c0 .8-.7 1.2-1.4 1H5.9c-.7.2-1.4-.2-1.4-1z" />
      <path d="M10 12v6.2c0 1.1.9 2 2 2s2-.9 2-2V12" />
      <path d="M8 11.2c.4-1.2 1.2-2 2.4-2.4M16 11.2c-.4-1.2-1.2-2-2.4-2.4" opacity="0.55" />
    </svg>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 16V5" />
      <path d="M8 8.5 12 4.5 16 8.5" />
      <path d="M5 19h14" />
    </svg>
  )
}

export function IconCamera(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.1-1.6A1.5 1.5 0 0 1 10 3.5h4a1.5 1.5 0 0 1 1.2.9L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  )
}

export function IconCap(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 13c0-3.8 3.1-7 7-7s7 3.2 7 7H5z" />
      <ellipse cx="12" cy="13" rx="7" ry="1.4" />
    </svg>
  )
}

export function IconGills(props: IconProps) {
  return (
    <svg {...base(props)}>
      <ellipse cx="12" cy="8" rx="7" ry="2.2" />
      <path d="M6 9.2 8 18M9 9 10.2 18M12 8.8v9.4M15 9l1.2 9M18 9.2 16 18" />
    </svg>
  )
}

export function IconStem(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 5h4v12.5a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V5z" />
      <path d="M8 7h8" opacity="0.5" />
    </svg>
  )
}

export function IconBase(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 4h4v10" />
      <path d="M8 18c1.5-2.5 2.5-3.5 4-3.5s2.5 1 4 3.5" />
      <ellipse cx="12" cy="19" rx="5.5" ry="1.5" />
    </svg>
  )
}

export function IconHabitat(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 18h16" />
      <path d="M7 18V11l3-4 3 4v7" />
      <path d="M14 18v-5l2.5-3.5L19 13v5" />
    </svg>
  )
}

export function IconDetail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="5.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="5.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  )
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.5 3.8 19h16.4L12 4.5z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="16.6" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12.5 10 17.5 19 7.5" />
    </svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconFlip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <path d="M17 4v3.5h-3.5" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8" />
      <path d="M7 20v-3.5h3.5" />
    </svg>
  )
}

export function IconSkip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 7v10l8-5-8-5z" />
      <path d="M17 7v10" />
    </svg>
  )
}

export function IconLightbulb(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a5.5 5.5 0 0 1 3.5 9.7c-.6.5-1 1.2-1.1 2H9.6c-.1-.8-.5-1.5-1.1-2A5.5 5.5 0 0 1 12 3z" />
    </svg>
  )
}

export function IconMicroscope(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 4h4v5l2 3" />
      <circle cx="15.5" cy="14.5" r="3.5" />
      <path d="M6 20h12" />
      <path d="M8 17h4" />
    </svg>
  )
}

export function IconBook(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15.5H7.5A2.5 2.5 0 0 0 5 21V5.5z" />
      <path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19" />
    </svg>
  )
}

export function IconLeaf(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 15c0-5 4-10 14-11-1 10-6 14-11 14a5 5 0 0 1-3-3z" />
      <path d="M8 14c2-2 5-4 9-5" />
    </svg>
  )
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

export function IconThumbsUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 11v9H5.5A1.5 1.5 0 0 1 4 18.5v-6A1.5 1.5 0 0 1 5.5 11H8z" />
      <path d="M8 11l2.2-5.2A1.8 1.8 0 0 1 11.9 4.5c.9 0 1.6.8 1.5 1.7L13 11h5.2a2 2 0 0 1 2 2.3l-1 6a2 2 0 0 1-2 1.7H8" />
    </svg>
  )
}

export function IconThumbsDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 13V4h2.5A1.5 1.5 0 0 1 20 5.5v6A1.5 1.5 0 0 1 18.5 13H16z" />
      <path d="M16 13l-2.2 5.2a1.8 1.8 0 0 1-1.7 1.3c-.9 0-1.6-.8-1.5-1.7L11 13H5.8a2 2 0 0 1-2-2.3l1-6a2 2 0 0 1 2-1.7H16" />
    </svg>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconHistory(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 5v4h4" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  )
}

export function IconExpert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M6 19c1.2-3 3.2-4.5 6-4.5s4.8 1.5 6 4.5" />
      <path d="M17 6.5l1.2-1.2M18.5 9H20" opacity="0.7" />
    </svg>
  )
}

export function IconBan(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7 7l10 10" />
    </svg>
  )
}

export function IconFlame(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20c3.3 0 5.5-2.2 5.5-5.2 0-2.4-1.4-4-2.8-5.3.2 1.5-.4 2.5-1.3 3 0-3.2-1.5-5.5-3.9-7.5 0 2.2-.7 3.8-1.9 5C6.5 11.5 5.5 13 5.5 15 5.5 17.8 7.8 20 12 20z" />
    </svg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 7h14" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7.5 7l.8 12h7.4l.8-12" />
    </svg>
  )
}

export function IconSun(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v2M12 18.5v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M3.5 12h2M18.5 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4" />
    </svg>
  )
}

export function IconSnowflake(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18M5 7.5l14 9M19 7.5l-14 9" />
      <path d="M9 5l3-2 3 2M9 19l3 2 3-2" />
    </svg>
  )
}

export function IconBasket(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 9h16l-1.5 10H5.5L4 9z" />
      <path d="M9 9V6.5A3 3 0 0 1 12 3.5h0A3 3 0 0 1 15 6.5V9" />
    </svg>
  )
}

export function IconKnife(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 16.5 16 5.5a2.5 2.5 0 0 1 3.5 3.5L12 16.5H5z" />
      <path d="M8 13.5 5.5 16" />
    </svg>
  )
}

export function IconNote(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4h8l4 4v12H7V4z" />
      <path d="M15 4v4h4" />
      <path d="M10 12h6M10 15h4" />
    </svg>
  )
}

export function IconCar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13" />
      <path d="M4 13h16v4.5a1.5 1.5 0 0 1-1.5 1.5h-1" />
      <circle cx="7.5" cy="18" r="1.5" />
      <circle cx="16.5" cy="18" r="1.5" />
      <path d="M9 18h6" />
    </svg>
  )
}

export function IconBrush(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 4l6 6-7.5 7.5H6.5V11.5L14 4z" />
      <path d="M6.5 17.5 5 20.5l3-1.5" />
    </svg>
  )
}

/** Map multi-view / camera step ids to icons */
export function ViewIcon({
  view,
  size = 22,
  className,
}: {
  view: string
  size?: number | string
  className?: string
}) {
  const p = { size, className }
  switch (view) {
    case 'cap':
    case 'front':
      return <IconCap {...p} />
    case 'gills':
      return <IconGills {...p} />
    case 'stem':
      return <IconStem {...p} />
    case 'base':
      return <IconBase {...p} />
    case 'habitat':
      return <IconHabitat {...p} />
    case 'detail':
      return <IconDetail {...p} />
    default:
      return <IconMushroom {...p} />
  }
}
