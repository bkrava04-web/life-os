export function validateFeedback(log) {
  const rating=value=>value==null || (Number.isInteger(value)&&value>=1&&value<=5);
  if(log.feedback!==undefined){const f=log.feedback;if(!f||typeof f!=='object'||Array.isArray(f)||!rating(f.overallDifficulty)||!rating(f.energy)|| ![null,undefined,'good','average','poor'].includes(f.sleep)||typeof f.pain!=='boolean')throw new Error('Некорректная оценка восстановления');}
  for(const result of Object.values(log.exercises||{}))if(!rating(result.difficulty)||![null,undefined,'good','poor'].includes(result.technique))throw new Error('Оценка упражнения: 1–5; техника: хорошая или нарушается');
}
