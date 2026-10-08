export function WeightMacros({ result }) {
  if (!result?.days) return <small className="weight-row-note">No logged days</small>;
  const { calories, proteins, carbs, fats } = result.average;
  return (
    <div className="weight-macros">
      <strong>{Math.round(calories).toLocaleString()}<small> kcal/day</small></strong>
      <span>P {Math.round(proteins)} · C {Math.round(carbs)} · F {Math.round(fats)}g</span>
      <span>avg over {result.days} {result.days === 1 ? 'day' : 'days'}</span>
    </div>
  );
}
