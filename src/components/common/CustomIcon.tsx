import React from 'react';
import { cn } from '../../lib/utils';

export type CustomIconName =
  | 'bublina'     // #e9b451 (yellow speech bubble with text lines)
  | 'cepice'      // #44a3fe (blue graduation cap)
  | 'dialog'      // #2bcbfe (cyan speech bubble)
  | 'hvezda'      // #c37393 (pink sparkles / stars)
  | 'hvezda2'     // #e9b451 (yellow 5-pointed star)
  | 'kalendar'    // #2f3cc1 (dark blue calendar)
  | 'kniha'       // #2bcbfe (cyan open book)
  | 'kniha-bila'  // #ffffff (white open book)
  | 'material'    // #e9b451 (yellow sheet / material)
  | 'mozek'       // #c37393 (pink brain)
  | 'mozek-bila'  // #ffffff (white brain)
  | 'posta'       // #2f3cc1 (dark blue mail envelope)
  | 'spatne'      // #c37393 (pink wrong cross circle)
  | 'spoluprace'  // #2f3cc1 (dark blue handshake)
  | 'spravne'     // #2bcbfe (cyan correct check circle)
  | 'srdce'       // #c37393 (pink heart)
  | 'telefon'     // #c37393 (pink phone receiver)
  | 'tym'         // #2f3cc1 + #ffffff (dark blue + white team)
  | 'zarovka';    // #e9b451 (yellow lightbulb)

export interface CustomIconProps {
  name: CustomIconName;
  size?: number | string;
  className?: string;
  alt?: string;
  title?: string;
  strokeWidth?: number | string;
  style?: React.CSSProperties;
}

export function CustomIcon({
  name,
  size,
  className,
  alt = '',
  title,
  style,
}: CustomIconProps) {
  const hasExplicitTailwindSize = className
    ? /\b(w-\S+|h-\S+|size-\S+)\b/.test(className)
    : false;

  const computedSize = size ?? (hasExplicitTailwindSize ? undefined : 20);

  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/${name}.svg`}
      alt={alt}
      title={title}
      draggable={false}
      style={{
        ...(computedSize !== undefined
          ? { width: computedSize, height: computedSize }
          : {}),
        ...style,
      }}
      className={cn(
        'inline-block object-contain select-none shrink-0 pointer-events-none',
        className
      )}
    />
  );
}

export type BoundCustomIconProps = Omit<CustomIconProps, 'name'>;

function createBoundIcon(name: CustomIconName, displayName: string) {
  const Comp: React.FC<BoundCustomIconProps> = (props) => (
    <CustomIcon name={name} {...props} />
  );
  Comp.displayName = displayName;
  return Comp;
}

// Speech bubbles (MessageSquare / HelpCircle)
export const BubbleYellowIcon = createBoundIcon('bublina', 'BubbleYellowIcon');
export const DialogCyanIcon = createBoundIcon('dialog', 'DialogCyanIcon');

// Stars & Sparkles (Sparkles / Award / Crown / Star)
export const StarPinkIcon = createBoundIcon('hvezda', 'StarPinkIcon');
export const StarYellowIcon = createBoundIcon('hvezda2', 'StarYellowIcon');

// Books & Materials (BookOpen / BookMarked / FileText / Layers)
export const BookCyanIcon = createBoundIcon('kniha', 'BookCyanIcon');
export const BookWhiteIcon = createBoundIcon('kniha-bila', 'BookWhiteIcon');
export const MaterialYellowIcon = createBoundIcon('material', 'MaterialYellowIcon');

// Education & Courses (GraduationCap)
export const CapIcon = createBoundIcon('cepice', 'CapIcon');

// Calendar (Calendar / CalendarIcon)
export const CalendarBlueIcon = createBoundIcon('kalendar', 'CalendarBlueIcon');

// Brain & Practice (Target / Calculator / Brain)
export const BrainPinkIcon = createBoundIcon('mozek', 'BrainPinkIcon');
export const BrainWhiteIcon = createBoundIcon('mozek-bila', 'BrainWhiteIcon');

// Lightbulb & Hints (Lightbulb / 💡)
export const BulbYellowIcon = createBoundIcon('zarovka', 'BulbYellowIcon');

// Correct & Wrong (CheckCircle2 / Check / XCircle)
export const CorrectCyanIcon = createBoundIcon('spravne', 'CorrectCyanIcon');
export const WrongPinkIcon = createBoundIcon('spatne', 'WrongPinkIcon');

// Contact (Mail / Phone)
export const MailBlueIcon = createBoundIcon('posta', 'MailBlueIcon');
export const PhonePinkIcon = createBoundIcon('telefon', 'PhonePinkIcon');

// People, Collaboration & Team (Gift / Share2 / Users / User)
export const CoopBlueIcon = createBoundIcon('spoluprace', 'CoopBlueIcon');
export const TeamBlueIcon = createBoundIcon('tym', 'TeamBlueIcon');

// Heart & Streak (Flame / Heart)
export const HeartPinkIcon = createBoundIcon('srdce', 'HeartPinkIcon');

export default CustomIcon;
