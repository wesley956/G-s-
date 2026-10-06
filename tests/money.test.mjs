import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, parseDecimal } from '../src/lib/money.ts';
test('Brazilian and decimal-dot amounts preserve cents',()=>{
 for(const [value,expected] of [['115,50',11550],['115.50',11550],['1.234,56',123456],['0,01',1],['',0]]) assert.equal(toCents(value),expected);
});
test('negative, infinite, ambiguous and overprecise amounts are rejected',()=>{
 for(const value of ['-1','Infinity','NaN','abc','1.234','1,234','1,,00','1.00.00','1e3']) assert.throws(()=>toCents(value));
 assert.equal(parseDecimal('2.50'),2.5);
});
