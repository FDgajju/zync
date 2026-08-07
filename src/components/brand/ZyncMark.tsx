import { cn } from '../../lib/utils';

export type ZyncMarkVariant = 'brand' | 'theme';
/**
 * bare — no plate (monochrome assets / transparent bg)
 * borderless — soft rounded plate, no hairline
 * ring — plate + hairline (shipped app icon)
 */
export type ZyncMarkFrame = 'bare' | 'borderless' | 'ring';

type ZyncMarkProps = {
    /** CSS px size of the square mark */
    size?: number;
    className?: string;
    /**
     * theme (default) — accent / text tokens
     * brand — fixed indigo (+ white underscore on plated marks)
     */
    variant?: ZyncMarkVariant;
    /**
     * bare (default) — background-less glyph (`logo-monochrome-*.svg`)
     * borderless — plate, no ring (`logo-icon-legacy.svg`)
     * ring — plate + ring (`logo-icon.svg`)
     */
    frame?: ZyncMarkFrame;
    title?: string;
};

/**
 * Zync mark — shared geometry for chrome / splash / About.
 * Default is bare (no background), matching monochrome assets.
 */
export function ZyncMark({
    size = 24,
    className,
    variant = 'theme',
    frame = 'bare',
    title = 'Zync',
}: ZyncMarkProps) {
    const isBrand = variant === 'brand';
    const isBare = frame === 'bare';
    const withPlate = frame === 'borderless' || frame === 'ring';
    const withRing = frame === 'ring';

    // Monochrome: scale 0.96 @ 256,248 + underscore from x=248
    // Plated: scale 0.92; ring version shifts up slightly for balance
    const glyphTransform = isBare
        ? 'translate(256 248) scale(0.96) translate(-256 -256)'
        : withRing
            ? 'translate(256 248) scale(0.92) translate(-256 -256)'
            : 'translate(256 256) scale(0.92) translate(-256 -256)';

    const underscorePath = isBare ? 'M248 341.333H392' : 'M256 341.333H384';

    /*
      Product ring mark (About / app-icon family): dark plate always reads as a real
      tile on light and dark UIs. Ring + chevron follow theme accent; underscore white.
      Bare chrome stays monochrome accent. Soft borderless plate uses accent/10.
    */
    const isProductTile = withRing; // plate + ring geometry
    const chevronStroke = isBrand ? '#6366f1' : undefined;
    const underscoreStroke =
        isBrand || isProductTile ? (isBare ? '#6366f1' : '#ffffff') : undefined;
    const chevronClass = isBrand ? undefined : 'stroke-app-accent';
    const underscoreClass =
        isBrand || isProductTile
            ? undefined
            : isBare
                ? 'stroke-app-accent'
                : 'stroke-app-text';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn('shrink-0 select-none', className)}
            role="img"
            aria-label={title}
        >
            {withPlate && (
                <rect
                    width="512"
                    height="512"
                    rx="112"
                    fill={isBrand ? '#0f172a' : undefined}
                    className={
                        isBrand
                            ? undefined
                            : isProductTile
                                ? 'zync-mark-plate-product'
                                : 'fill-app-accent/10'
                    }
                />
            )}
            {withRing && (
                <rect
                    x="9"
                    y="9"
                    width="494"
                    height="494"
                    rx="103"
                    fill="none"
                    strokeWidth="18"
                    // Brand assets: soft full indigo. Theme: CSS lifts accent so the
                    // hairline stays visible on the always-dark product plate.
                    strokeOpacity={isBrand ? 0.35 : undefined}
                    stroke={isBrand ? '#6366f1' : undefined}
                    className={isBrand ? undefined : 'zync-mark-ring-product'}
                />
            )}
            <g transform={glyphTransform}>
                <path
                    d="M128 170.667L213.333 256L128 341.333"
                    strokeWidth="64"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    stroke={chevronStroke}
                    className={chevronClass}
                />
                <path
                    d={underscorePath}
                    strokeWidth="64"
                    strokeLinecap="round"
                    stroke={underscoreStroke}
                    className={underscoreClass}
                />
            </g>
        </svg>
    );
}
