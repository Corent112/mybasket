"use client";

export default function RatingButtons({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={`rating-buttons ${compact ? "compact" : ""}`}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          type="button"
          key={rating}
          className={value === rating ? "on" : ""}
          onClick={() => onChange(rating)}
          aria-label={`${rating} sur 5`}
        >
          {rating}
        </button>
      ))}
      <style jsx>{`
        .rating-buttons{display:flex;gap:5px;flex-wrap:wrap}
        button{width:38px;height:38px;border:1px solid #e5d8d0;border-radius:10px;background:#fff;color:#6b1a2c;font-weight:950;cursor:pointer}
        button:hover{border-color:#d4a24c}.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}
        .compact button{width:30px;height:30px;border-radius:8px;font-size:11px}
      `}</style>
    </div>
  );
}
