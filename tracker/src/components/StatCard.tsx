interface StatCardProps {
  label: string
  value: string | number
  icon?: string
}

export default function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-1">
      <div className="text-2xl font-bold text-black">
        {icon && <span className="mr-1">{icon}</span>}
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
