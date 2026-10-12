export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 5.75C5 4.78 5.78 4 6.75 4h10.5C18.22 4 19 4.78 19 5.75v9.5c0 .97-.78 1.75-1.75 1.75H9l-4 3V5.75Z"
            fill="currentColor"
          />
          <path
            d="M8.5 8h7M8.5 11h5"
            stroke="var(--brand-cut,#17171c)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        ReplyFolio<span className="brand-period">.</span>
      </span>
    </div>
  );
}
