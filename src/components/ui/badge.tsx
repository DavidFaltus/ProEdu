import * as React from "react"
import { cn } from "../../lib/utils"

type BadgeProps = React.ComponentProps<'div'> & {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants = {
    default: "border-transparent bg-brand-blue text-white shadow hover:bg-brand-blue/80",
    secondary: "border-transparent bg-gray-100 text-gray-900 hover:bg-gray-100/80",
    destructive: "border-transparent bg-red-500 text-white shadow hover:bg-red-500/80",
    outline: "text-gray-950 border-gray-200 hover:bg-gray-50",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
