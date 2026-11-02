export interface RecurrenceRule { active:boolean; startDate?:string; endDate?:string; frequency:string; daysOfWeek?:number[]; dayOfWeek?:number; dayOfMonth?:number; }

export function shouldGenerate(date:Date, template:RecurrenceRule) {
  if (!template.active) return false;
  const day=date.getDay();
  const dom=date.getDate();
  const iso=date.toISOString().slice(0,10);
  if(template.startDate && iso<template.startDate) return false;
  if(template.endDate && iso>template.endDate) return false;
  if(template.frequency==='daily') return true;
  if(template.frequency==='weekly') return (template.daysOfWeek?.length ? template.daysOfWeek : template.dayOfWeek===undefined ? [] : [template.dayOfWeek]).includes(day);
  if(template.frequency==='monthly') return dom===template.dayOfMonth;
  return false;
}
export function occurrenceKey(templateId:string,date:Date){return `${templateId}_${date.toISOString().slice(0,10)}`;}
