"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VisualPasswordCreatorProps {
  onPasswordChange: (type: string, data: any) => void;
  value?: { type: string; data: any } | null;
}

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

  const handleTypeChange = (type: string) => {
    setPasswordType(type);
    // Reset data when changing type
    setSelectedAnimal("");
    setSelectedObject("");
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
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Visual Password Type *</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
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
          <strong>Note:</strong> This will be the student's visual password. They will need to select this exact {passwordType === "object" ? "picture" : "animal"} to log in.
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

