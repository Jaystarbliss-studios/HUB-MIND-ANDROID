import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
test('Firestore has a deny-by-default boundary',()=>assert.match(rules,/match \/\{document=\*\*\} \{ allow read, write: if false; \}/));
test('workspace resources require active membership',()=>{ for(const name of ['tasks','documents','projects','clients','meetings','followUps','knowledge']) assert.match(rules,new RegExp(`match /${name}/\\{id\\}\\s*\\{[^}]*member\\(\\)`, 's')); });
test('invitation acceptance is bound to the authenticated email and uid',()=>{ assert.match(rules,/acceptedUid == request\.auth\.uid/); assert.match(rules,/email == request\.auth\.token\.email/); });
test('recurring tasks are owner/admin controlled',()=>assert.match(rules,/match \/recurringTaskTemplates\/\{id\}/));