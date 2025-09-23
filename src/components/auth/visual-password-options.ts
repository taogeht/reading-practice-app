export interface VisualPasswordOption {
  id: string;
  name: string;
  emoji: string;
  color?: string;
}

export const ANIMALS: VisualPasswordOption[] = [
  { id: 'cat', name: 'Cat', emoji: '🐱' },
  { id: 'dog', name: 'Dog', emoji: '🐶' },
  { id: 'rabbit', name: 'Rabbit', emoji: '🐰' },
  { id: 'bear', name: 'Bear', emoji: '🐻' },
  { id: 'lion', name: 'Lion', emoji: '🦁' },
  { id: 'tiger', name: 'Tiger', emoji: '🐯' },
  { id: 'fox', name: 'Fox', emoji: '🦊' },
  { id: 'panda', name: 'Panda', emoji: '🐼' },
  { id: 'koala', name: 'Koala', emoji: '🐨' },
  { id: 'monkey', name: 'Monkey', emoji: '🐵' },
  { id: 'elephant', name: 'Elephant', emoji: '🐘' },
  { id: 'pig', name: 'Pig', emoji: '🐷' },
];

export const OBJECTS: VisualPasswordOption[] = [
  { id: 'apple', name: 'Apple', emoji: '🍎' },
  { id: 'banana', name: 'Banana', emoji: '🍌' },
  { id: 'car', name: 'Car', emoji: '🚗' },
  { id: 'house', name: 'House', emoji: '🏠' },
  { id: 'tree', name: 'Tree', emoji: '🌳' },
  { id: 'flower', name: 'Flower', emoji: '🌸' },
  { id: 'star', name: 'Star', emoji: '⭐' },
  { id: 'heart', name: 'Heart', emoji: '❤️' },
  { id: 'sun', name: 'Sun', emoji: '☀️' },
  { id: 'moon', name: 'Moon', emoji: '🌙' },
  { id: 'book', name: 'Book', emoji: '📚' },
  { id: 'ball', name: 'Ball', emoji: '⚽' },
];

export const SHAPES_AND_COLORS: VisualPasswordOption[] = [
  { id: 'red-circle', name: 'Red Circle', emoji: '🔴', color: 'red' },
  { id: 'blue-circle', name: 'Blue Circle', emoji: '🔵', color: 'blue' },
  { id: 'yellow-circle', name: 'Yellow Circle', emoji: '🟡', color: 'yellow' },
  { id: 'green-circle', name: 'Green Circle', emoji: '🟢', color: 'green' },
  { id: 'purple-circle', name: 'Purple Circle', emoji: '🟣', color: 'purple' },
  { id: 'orange-circle', name: 'Orange Circle', emoji: '🟠', color: 'orange' },
  { id: 'red-square', name: 'Red Square', emoji: '🟥', color: 'red' },
  { id: 'blue-square', name: 'Blue Square', emoji: '🟦', color: 'blue' },
  { id: 'yellow-square', name: 'Yellow Square', emoji: '🟨', color: 'yellow' },
  { id: 'green-square', name: 'Green Square', emoji: '🟩', color: 'green' },
  { id: 'purple-square', name: 'Purple Square', emoji: '🟪', color: 'purple' },
  { id: 'orange-square', name: 'Orange Square', emoji: '🟧', color: 'orange' },
];

export const AVATARS: VisualPasswordOption[] = [
  { id: 'girl', name: 'Girl Avatar', emoji: '👧🏼' },
  { id: 'boy', name: 'Boy Avatar', emoji: '👦🏼' },
];

export function getVisualPasswordOptions(type: 'animal' | 'object' | 'color_shape'): VisualPasswordOption[] {
  switch (type) {
    case 'animal':
      return ANIMALS;
    case 'object':
      return OBJECTS;
    case 'color_shape':
      return SHAPES_AND_COLORS;
    default:
      return [];
  }
}
