export interface VisualPasswordOption {
  id: string;
  name: string;
  emoji: string;
  color?: string;
  colorClass?: string;
  shape?: string;
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

const COLOR_DEFINITIONS = [
  { value: 'red', name: 'Red', className: 'text-red-500' },
  { value: 'blue', name: 'Blue', className: 'text-blue-500' },
  { value: 'green', name: 'Green', className: 'text-green-500' },
  { value: 'yellow', name: 'Yellow', className: 'text-yellow-400' },
  { value: 'purple', name: 'Purple', className: 'text-purple-500' },
  { value: 'orange', name: 'Orange', className: 'text-orange-500' },
  { value: 'pink', name: 'Pink', className: 'text-pink-500' },
  { value: 'brown', name: 'Brown', className: 'text-amber-800' },
];

const SHAPE_DEFINITIONS = [
  { value: 'circle', name: 'Circle', symbol: '●' },
  { value: 'square', name: 'Square', symbol: '■' },
  { value: 'triangle', name: 'Triangle', symbol: '▲' },
  { value: 'star', name: 'Star', symbol: '★' },
  { value: 'heart', name: 'Heart', symbol: '♥' },
  { value: 'diamond', name: 'Diamond', symbol: '♦' },
];

export const SHAPES_AND_COLORS: VisualPasswordOption[] = COLOR_DEFINITIONS.flatMap((color) =>
  SHAPE_DEFINITIONS.map((shape) => ({
    id: `${color.value}-${shape.value}`,
    name: `${color.name} ${shape.name}`,
    emoji: shape.symbol,
    color: color.value,
    colorClass: color.className,
    shape: shape.value,
  }))
);

export const AVATARS: VisualPasswordOption[] = [
  { id: 'girl_blonde', name: 'Girl (Blonde)', emoji: '👧🏼' },
  { id: 'boy_blonde', name: 'Boy (Blonde)', emoji: '👦🏼' },
  { id: 'girl_brown', name: 'Girl (Brown Hair)', emoji: '👧🏽' },
  { id: 'boy_brown', name: 'Boy (Brown Hair)', emoji: '👦🏽' },
  { id: 'girl_dark', name: 'Girl (Dark Hair)', emoji: '👧🏿' },
  { id: 'boy_dark', name: 'Boy (Dark Hair)', emoji: '👦🏿' },
  { id: 'student_yellow', name: 'Student', emoji: '🧒' },
  { id: 'student_light', name: 'Student (Light Skin)', emoji: '🧒🏻' },
  { id: 'student_medium', name: 'Student (Medium Skin)', emoji: '🧒🏽' },
  { id: 'student_dark', name: 'Student (Dark Skin)', emoji: '🧒🏿' },
  { id: 'cat', name: 'Friendly Cat', emoji: '🐱' },
  { id: 'dog', name: 'Happy Dog', emoji: '🐶' },
  { id: 'panda', name: 'Playful Panda', emoji: '🐼' },
  { id: 'dino', name: 'Cute Dinosaur', emoji: '🦕' },
  { id: 'rocket', name: 'Rocket Pilot', emoji: '🚀' },
  { id: 'star', name: 'Shining Star', emoji: '⭐' },
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
