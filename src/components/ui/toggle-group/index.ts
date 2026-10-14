import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as ToggleGroup } from './ToggleGroup.vue'
export { default as ToggleGroupItem } from './ToggleGroupItem.vue'

export const toggleGroupVariants = cva('group/toggle-group flex w-fit items-center gap-0 rounded-md data-[variant=outline]:shadow-xs', {
  variants: {
    variant: {
      default: '',
      outline: '',
    },
    size: {
      default: '',
      sm: '',
      lg: '',
    },
  },
  defaultVariants: {
    variant: 'outline',
    size: 'default',
  },
})

export const toggleVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground first:rounded-l-md last:rounded-r-md rounded-none border-l-0 first:border-l',
      },
      size: {
        default: 'h-8 min-w-8 px-3',
        sm: 'h-7 min-w-7 px-2.5 text-xs',
        lg: 'h-9 min-w-9 px-3.5',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
    },
  },
)

export type ToggleGroupVariants = VariantProps<typeof toggleGroupVariants>
