const WORD_END = '(?=$|[\\s?!,.;:])';
const EXPLICIT_ACTION = new RegExp(`^(?:создай(?:те)?|добавь(?:те)?|перенеси(?:те)?|измени(?:те)?|переименуй(?:те)?|обнови(?:те)?|запланируй(?:те)?|поставь(?:те)?|привяжи(?:те)?|свяжи(?:те)?|составь(?:те)?|распланируй(?:те)?|отредактируй(?:те)?|исправь(?:те)?)${WORD_END}`, 'iu');
const WANT_ACTION = new RegExp(`^(?:я\\s+)?(?:хочу|нужно|надо|пожалуйста,?\\s*хочу)\\s+(?:создать|добавить|перенести|изменить|переименовать|обновить|запланировать|поставить|привязать|составить|распланировать|отредактировать)${WORD_END}`, 'iu');
const INFORMATION_OR_DISCUSSION = new RegExp(`^(?:что|какой|какая|какие|когда|сколько|где|почему|зачем|как|посоветуй|объясни|расскажи|подскажи|стоит ли|думаю|я думаю|может быть|мне интересно)${WORD_END}|^что\\s+если${WORD_END}`, 'iu');
const AFFIRMATIVE = /^(?:да|да,? конечно|да,? но|ок(?:ей)?|хорошо|подтверждаю|согласен|согласна)[.!\s]*$/i;
const APPLY_REQUEST = /^(?:примени|применить|подтверди|подтвердить)(?:\s|$)/i;

function latestAssistant(history) {
  return [...(Array.isArray(history) ? history : [])].reverse().find(item => item?.role === 'assistant')?.content || '';
}

export function classifyAIIntent(message, history = [], { hasPendingProposal = false } = {}) {
  const text = String(message || '').trim();
  if (!text) return 'answer';
  const assistant = latestAssistant(history).trim();
  const assistantAsked = /[?？]\s*$/.test(assistant);

  // A chat acknowledgement is never an apply command. The only apply path is
  // the explicit proposal button; this route merely explains that distinction.
  if (hasPendingProposal && (AFFIRMATIVE.test(text) || APPLY_REQUEST.test(text)) && !assistantAsked) return 'approval';
  if (assistantAsked && Array.from(text).length <= 180) return 'followup';
  if (EXPLICIT_ACTION.test(text) || WANT_ACTION.test(text)) return 'action';
  if (INFORMATION_OR_DISCUSSION.test(text)) return 'answer';
  return 'auto';
}

export function isProposalLikeResponse(value) {
  const text = String(value || '').trim();
  return text.startsWith('{') || text.startsWith('```');
}

