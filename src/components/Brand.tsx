export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 5.5h8.25a3.25 3.25 0 0 1 0 6.5h-4.5a3.25 3.25 0 0 0 0 6.5H18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="6" cy="5.5" r="1.5" fill="currentColor" />
          <circle cx="18" cy="18.5" r="1.5" fill="currentColor" />
        </svg>
      </span>
      <span>
        GrowthThread<span className="brand-period">.</span>
      </span>
    </div>
  );
}
