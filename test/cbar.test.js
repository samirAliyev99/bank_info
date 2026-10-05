import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCbarXml, cbarUrlFor } from '../src/sources/cbar.js';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ValCurs Date="03.10.2026" Name="AZN məzənnələri" Description="">
  <ValType Type="Bank metalları">
    <Valute Code="XAU"><Nominal>1 t.u.</Nominal><Name>Qızıl</Name><Value>6500.1234</Value></Valute>
  </ValType>
  <ValType Type="Xarici valyutalar">
    <Valute Code="USD"><Nominal>1</Nominal><Name>1 ABŞ dolları</Name><Value>1.7</Value></Valute>
    <Valute Code="EUR"><Nominal>1</Nominal><Name>1 Avro</Name><Value>1.9876</Value></Valute>
    <Valute Code="JPY"><Nominal>100</Nominal><Name>100 Yapon yeni</Name><Value>1.1500</Value></Valute>
  </ValType>
</ValCurs>`;

test('parses CBAR XML into AZN-per-unit rates', () => {
  const { date, rates } = parseCbarXml(XML);
  assert.equal(date, '03.10.2026');
  assert.equal(rates.USD, 1.7);
  assert.equal(rates.EUR, 1.9876);
  assert.equal(rates.JPY, 0.0115);
  assert.equal(rates.XAU, 6500.1234);
});

test('builds the daily file URL', () => {
  assert.equal(cbarUrlFor(new Date(2026, 0, 5)), 'https://www.cbar.az/currencies/05.01.2026.xml');
});
