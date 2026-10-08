import { BicepsFlexed, HeartPulse, Shirt } from 'lucide-react';

// Body-part icons drawn in Lucide's style (24px grid, 2px round strokes) for the parts Lucide has no icon for.
function bodyIcon(paths) {
  return function BodyIcon(props) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths.map((d) => <path d={d} key={d} />)}</svg>;
  };
}

const BackIcon = bodyIcon(['M3 6.5 6.5 4h11L21 6.5 18 12l-1 8H7l-1-8z', 'M12 4v16', 'M7.5 8c1.2 2 2.8 3 4.5 3s3.3-1 4.5-3']);

const ShouldersIcon = bodyIcon(['M12 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5', 'M9 10h6', 'M3 21v-6.5A4.5 4.5 0 0 1 7.5 10H9', 'M21 21v-6.5a4.5 4.5 0 0 0-4.5-4.5H15', 'M7 21v-6', 'M17 21v-6']);

const AbdomenIcon = bodyIcon(['M7 3.5c1.5-.7 3.2-1 5-1s3.5.3 5 1V16c0 3-2.2 5.5-5 5.5S7 19 7 16z', 'M12 3v18', 'M7 8.5h10', 'M7 13.5h10']);

const LegsIcon = bodyIcon(['M5 3h14', 'M5.5 3c-.5 5 0 8 1 10.5s0 5 0 7.5', 'M11 3c0 5-.5 8-1.5 10.5s.5 5 .5 7.5', 'M18.5 3c.5 5 0 8-1 10.5s0 5 0 7.5', 'M13 3c0 5 .5 8 1.5 10.5s-.5 5-.5 7.5']);

const GlutesIcon = bodyIcon(['M5 4h14', 'M5 7h14', 'M5 4 3.5 19h6.5L12 11l2 8h6.5L19 4']);

export const workoutIcons = { chest: Shirt, back: BackIcon, shoulders: ShouldersIcon, arms: BicepsFlexed, legs: LegsIcon, glutes: GlutesIcon, cardio: HeartPulse, abdomen: AbdomenIcon };

export const defaultIcon = 'chest';

export const iconLabels = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes', cardio: 'Cardio', abdomen: 'Abdomen' };

// Icons from before the body-part set: cardio-type ones become cardio, the rest the default.
const legacyCardioIcons = ['run', 'bike', 'swim', 'hike', 'activity', 'timer', 'flame'];

export function iconKey(name) {
  if (workoutIcons[name]) return name;
  return legacyCardioIcons.includes(name) ? 'cardio' : defaultIcon;
}

export function WorkoutIcon({ name, ...props }) {
  const Icon = workoutIcons[iconKey(name)];
  return <Icon aria-hidden="true" {...props} />;
}
