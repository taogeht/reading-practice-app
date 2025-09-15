"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VisualPasswordCreatorProps {
  onPasswordChange: (type: string, data: any) => void;
  value?: { type: string; data: any } | null;
}

type ColorShapeData = {
  colors: string[];
  shapes: string[];
};

type AnimalData = {
  animals: string[];
};

type ObjectData = {
  objects: string[];
};

const COLORS = [
  { name: "Red", value: "red", class: "bg-red-500" },
  { name: "Blue", value: "blue", class: "bg-blue-500" },
  { name: "Green", value: "green", class: "bg-green-500" },
  { name: "Yellow", value: "yellow", class: "bg-yellow-500" },
  { name: "Purple", value: "purple", class: "bg-purple-500" },
  { name: "Orange", value: "orange", class: "bg-orange-500" },
  { name: "Pink", value: "pink", class: "bg-pink-500" },
  { name: "Brown", value: "brown", class: "bg-amber-700" },
];

const SHAPES = [
  { name: "Circle", value: "circle", symbol: "●" },
  { name: "Square", value: "square", symbol: "■" },
  { name: "Triangle", value: "triangle", symbol: "▲" },
  { name: "Star", value: "star", symbol: "★" },
  { name: "Heart", value: "heart", symbol: "♥" },
  { name: "Diamond", value: "diamond", symbol: "♦" },
];

const ANIMALS = [
  { name: "Cat", value: "cat", emoji: "🐱" },
  { name: "Dog", value: "dog", emoji: "🐶" },
  { name: "Elephant", value: "elephant", emoji: "🐘" },
  { name: "Lion", value: "lion", emoji: "🦁" },
  { name: "Monkey", value: "monkey", emoji: "🐵" },
  { name: "Bear", value: "bear", emoji: "🐻" },
  { name: "Rabbit", value: "rabbit", emoji: "🐰" },
  { name: "Frog", value: "frog", emoji: "🐸" },
];

const OBJECTS = [
  { name: "Ball", value: "ball", emoji: "⚽" },
  { name: "Car", value: "car", emoji: "🚗" },
  { name: "House", value: "house", emoji: "🏠" },
  { name: "Tree", value: "tree", emoji: "🌳" },
  { name: "Flower", value: "flower", emoji: "🌸" },
  { name: "Apple", value: "apple", emoji: "🍎" },
  { name: "Book", value: "book", emoji: "📚" },
  { name: "Sun", value: "sun", emoji: "☀️" },
];

export function VisualPasswordCreator({ onPasswordChange, value }: VisualPasswordCreatorProps) {
  const [passwordType, setPasswordType] = useState<string>(value?.type || "");
  const [selectedAnimal, setSelectedAnimal] = useState<string>(
    value?.type === "animal" ? value.data.animal || "" : ""
  );
  const [selectedObject, setSelectedObject] = useState<string>(
    value?.type === "object" ? value.data.object || "" : ""
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    value?.type === "color_shape" ? value.data.color || "" : ""
  );
  const [selectedShape, setSelectedShape] = useState<string>(
    value?.type === "color_shape" ? value.data.shape || "" : ""
  );

  const handleTypeChange = (type: string) => {
    setPasswordType(type);
    // Reset data when changing type
    setSelectedAnimal("");
    setSelectedObject("");
    setSelectedColor("");
    setSelectedShape("");
    onPasswordChange(type, {});
  };

  const handleAnimalSelect = (animal: string) => {
    setSelectedAnimal(animal);
    onPasswordChange("animal", { animal });
  };

  const handleObjectSelect = (object: string) => {
    setSelectedObject(object);
    onPasswordChange("object", { object });
  };

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    if (selectedShape) {
      onPasswordChange("color_shape", { color, shape: selectedShape });
    }
  };

  const handleShapeSelect = (shape: string) => {
    setSelectedShape(shape);
    if (selectedColor) {
      onPasswordChange("color_shape", { color: selectedColor, shape });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Visual Password Type *</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <Button
            type="button"
            variant={passwordType === "color_shape" ? "default" : "outline"}
            onClick={() => handleTypeChange("color_shape")}
            className="h-auto p-3 flex flex-col items-center"
          >
            <div className="text-2xl mb-1">🎨</div>
            <span className="text-xs">Colors & Shapes</span>
          </Button>
          <Button
            type="button"
            variant={passwordType === "animal" ? "default" : "outline"}
            onClick={() => handleTypeChange("animal")}
            className="h-auto p-3 flex flex-col items-center"
          >
            <div className="text-2xl mb-1">🐱</div>
            <span className="text-xs">Animals</span>
          </Button>
          <Button
            type="button"
            variant={passwordType === "object" ? "default" : "outline"}
            onClick={() => handleTypeChange("object")}
            className="h-auto p-3 flex flex-col items-center"
          >
            <div className="text-2xl mb-1">⚽</div>
            <span className="text-xs">Objects</span>
          </Button>
        </div>
      </div>

      {passwordType === "color_shape" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose One Color and One Shape</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Choose One Color *</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {COLORS.map((color) => (
                  <Button
                    key={color.value}
                    type="button"
                    variant={selectedColor === color.value ? "default" : "outline"}
                    onClick={() => handleColorSelect(color.value)}
                    className="h-12 flex items-center justify-center"
                  >
                    <div className={`w-4 h-4 rounded-full ${color.class} mr-2`}></div>
                    <span className="text-xs">{color.name}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Choose One Shape *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {SHAPES.map((shape) => (
                  <Button
                    key={shape.value}
                    type="button"
                    variant={selectedShape === shape.value ? "default" : "outline"}
                    onClick={() => handleShapeSelect(shape.value)}
                    className="h-12 flex items-center justify-center"
                  >
                    <span className="text-2xl mr-2">{shape.symbol}</span>
                    <span className="text-xs">{shape.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {passwordType === "animal" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose One Animal</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-sm font-medium">Choose One Animal *</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {ANIMALS.map((animal) => (
                <Button
                  key={animal.value}
                  type="button"
                  variant={selectedAnimal === animal.value ? "default" : "outline"}
                  onClick={() => handleAnimalSelect(animal.value)}
                  className="h-16 flex flex-col items-center justify-center"
                >
                  <span className="text-2xl mb-1">{animal.emoji}</span>
                  <span className="text-xs">{animal.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {passwordType === "object" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose One Object</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-sm font-medium">Choose One Object *</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {OBJECTS.map((object) => (
                <Button
                  key={object.value}
                  type="button"
                  variant={selectedObject === object.value ? "default" : "outline"}
                  onClick={() => handleObjectSelect(object.value)}
                  className="h-16 flex flex-col items-center justify-center"
                >
                  <span className="text-2xl mb-1">{object.emoji}</span>
                  <span className="text-xs">{object.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {passwordType && (
        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
          <strong>Note:</strong> This will be the student's visual password. They will need to select this exact {passwordType === "color_shape" ? "color and shape combination" : passwordType} to log in.
        </div>
      )}

      {passwordType === "color_shape" && selectedColor && selectedShape && (
        <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
          <strong>Password Set:</strong> {selectedColor.charAt(0).toUpperCase() + selectedColor.slice(1)} {selectedShape.charAt(0).toUpperCase() + selectedShape.slice(1)}
        </div>
      )}

      {passwordType === "animal" && selectedAnimal && (
        <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
          <strong>Password Set:</strong> {ANIMALS.find(a => a.value === selectedAnimal)?.emoji} {ANIMALS.find(a => a.value === selectedAnimal)?.name}
        </div>
      )}

      {passwordType === "object" && selectedObject && (
        <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
          <strong>Password Set:</strong> {OBJECTS.find(o => o.value === selectedObject)?.emoji} {OBJECTS.find(o => o.value === selectedObject)?.name}
        </div>
      )}
    </div>
  );
}