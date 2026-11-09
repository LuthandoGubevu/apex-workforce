const VARIANTS = {
  green:  'bg-green-100 text-green-700',
  red:    'bg-red-100 text-red-700',
  amber:  'bg-amber-100 text-amber-700',
  gray:   'bg-gray-100 text-gray-600',
  brand:  'bg-brand-50 text-brand-700',
} as const;

export default function Badge({
  label,
  variant = 'gray',
}: {
  label: string;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${VARIANTS[variant]}`}>
      {label}
    </span>
  );
}
