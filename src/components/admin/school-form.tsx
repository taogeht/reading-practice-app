'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface School {
  id?: string;
  name: string;
  district?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface SchoolFormProps {
  school?: School;
  onSave: (schoolData: any) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function SchoolForm({ school, onSave, onCancel, loading = false }: SchoolFormProps) {
  const [formData, setFormData] = useState({
    name: school?.name || '',
    district: school?.district || '',
    address: school?.address || '',
    city: school?.city || '',
    state: school?.state || '',
    zipCode: school?.zipCode || '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const isEditing = !!school?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};
    
    if (!formData.name) newErrors.name = 'School name is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving school:', error);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">School Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div>
        <Label htmlFor="district">District</Label>
        <Input
          id="district"
          value={formData.district}
          onChange={(e) => handleChange('district', e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => handleChange('address', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => handleChange('state', e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="zipCode">Zip Code</Label>
        <Input
          id="zipCode"
          value={formData.zipCode}
          onChange={(e) => handleChange('zipCode', e.target.value)}
        />
      </div>

      <div className="flex space-x-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : isEditing ? 'Update School' : 'Create School'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}