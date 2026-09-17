import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDuplexCardGrid,
  chunkStudents,
  renderLoginCardsHtml,
  type StudentCardData,
} from './login-cards-html';

const mockStudents: StudentCardData[] = [
  {
    id: 's1',
    firstName: 'Alice',
    lastName: 'Wong',
    loginToken: 'tok-1',
    visualPasswordType: 'animal',
    visualPasswordData: { animal: 'cat' },
  },
  {
    id: 's2',
    firstName: 'Bob',
    lastName: 'Chen',
    loginToken: 'tok-2',
    visualPasswordType: 'animal',
    visualPasswordData: { animal: 'dog' },
  },
  {
    id: 's3',
    firstName: 'Charlie',
    lastName: 'Lin',
    loginToken: 'tok-3',
    visualPasswordType: 'object',
    visualPasswordData: { object: 'star' },
  },
  {
    id: 's4',
    firstName: 'Daisy',
    lastName: 'Wu',
    loginToken: 'tok-4',
    visualPasswordType: 'object',
    visualPasswordData: { object: 'apple' },
  },
  {
    id: 's5',
    firstName: 'Evan',
    lastName: 'Chang',
    loginToken: 'tok-5',
    visualPasswordType: null,
    visualPasswordData: null,
  },
];

test('chunkStudents groups students into chunks of 4', () => {
  const chunks = chunkStudents(mockStudents, 4);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 4);
  assert.equal(chunks[1].length, 1);
  assert.equal(chunks[0][0].firstName, 'Alice');
  assert.equal(chunks[1][0].firstName, 'Evan');
});

test('buildDuplexCardGrid correctly mirrors columns horizontally for long-edge flip', () => {
  const chunk = [mockStudents[0], mockStudents[1], mockStudents[2], mockStudents[3]];
  const { front, back } = buildDuplexCardGrid(chunk);

  // Front: [S0, S1, S2, S3]
  // Row 1: Left=S0 (Alice), Right=S1 (Bob)
  // Row 2: Left=S2 (Charlie), Right=S3 (Daisy)
  assert.equal(front[0]?.firstName, 'Alice');
  assert.equal(front[1]?.firstName, 'Bob');
  assert.equal(front[2]?.firstName, 'Charlie');
  assert.equal(front[3]?.firstName, 'Daisy');

  // Back: [S1, S0, S3, S2]
  // Row 1: Left=S1 (Bob), Right=S0 (Alice) -> When flipped, Alice is behind Alice!
  // Row 2: Left=S3 (Daisy), Right=S2 (Charlie) -> When flipped, Charlie is behind Charlie!
  assert.equal(back[0]?.firstName, 'Bob');
  assert.equal(back[1]?.firstName, 'Alice');
  assert.equal(back[2]?.firstName, 'Daisy');
  assert.equal(back[3]?.firstName, 'Charlie');
});

test('buildDuplexCardGrid handles partial chunks with null slots', () => {
  // Only 1 student in chunk (slot 0)
  const chunk = [mockStudents[0], null, null, null];
  const { front, back } = buildDuplexCardGrid(chunk);

  // Front: [Alice, null, null, null]
  assert.equal(front[0]?.firstName, 'Alice');
  assert.equal(front[1], null);

  // Back: [null, Alice, null, null] -> Alice on right back aligns with Alice on left front!
  assert.equal(back[0], null);
  assert.equal(back[1]?.firstName, 'Alice');
  assert.equal(back[2], null);
  assert.equal(back[3], null);
});

test('renderLoginCardsHtml produces double-sided HTML with front and back sheets', () => {
  const html = renderLoginCardsHtml({
    classData: { id: 'c1', name: 'Class 2B', slug: '2b' },
    students: mockStudents,
    baseUrl: 'https://school.test',
    layout: 'double_sided',
  });

  // 5 students = 2 chunks of 4 -> 2 front sheets + 2 back sheets = 4 print pages
  const frontSheetCount = (html.match(/print-sheet-front/g) || []).length;
  const backSheetCount = (html.match(/print-sheet-back/g) || []).length;
  assert.equal(frontSheetCount, 2);
  assert.equal(backSheetCount, 2);

  // Checks content
  assert.ok(html.includes('Alice Wong'));
  assert.ok(html.includes('Class 2B'));
  assert.ok(html.includes('Scan to Log In'));
  assert.ok(html.includes('school.test/c/2b'));
  assert.ok(html.includes('Cat')); // Alice's password
  assert.ok(html.includes('<svg')); // Inline QR code SVG
});

test('renderLoginCardsHtml single-sided modes produce only requested sheets', () => {
  const qrHtml = renderLoginCardsHtml({
    classData: { id: 'c1', name: 'Class 2B', slug: '2b' },
    students: mockStudents,
    baseUrl: 'https://school.test',
    layout: 'qr',
  });
  assert.equal((qrHtml.match(/print-sheet-qr/g) || []).length, 2);
  assert.equal((qrHtml.match(/print-sheet-back/g) || []).length, 0);

  const passcodeHtml = renderLoginCardsHtml({
    classData: { id: 'c1', name: 'Class 2B', slug: '2b' },
    students: mockStudents,
    baseUrl: 'https://school.test',
    layout: 'passcode',
  });
  assert.equal((passcodeHtml.match(/print-sheet-passcode/g) || []).length, 2);
  assert.equal((passcodeHtml.match(/print-sheet-front/g) || []).length, 0);
});
