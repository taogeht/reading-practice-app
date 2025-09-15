'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SchoolForm from "@/components/admin/school-form";

interface School {
  id: string;
  name: string;
  district?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  createdAt: string;
  updatedAt: string;
}

export default function SchoolManagementPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/schools');
      if (!response.ok) {
        throw new Error('Failed to fetch schools');
      }
      const data = await response.json();
      setSchools(data.schools);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  const handleAddSchool = () => {
    setEditingSchool(undefined);
    setIsDialogOpen(true);
  };

  const handleEditSchool = (school: School) => {
    setEditingSchool(school);
    setIsDialogOpen(true);
  };

  const handleDeleteSchool = async (school: School) => {
    if (!confirm(`Are you sure you want to delete ${school.name}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/schools/${school.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete school');
      }

      await fetchSchools();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete school');
    }
  };

  const handleSaveSchool = async (schoolData: any) => {
    try {
      setFormLoading(true);
      
      const url = editingSchool 
        ? `/api/admin/schools/${editingSchool.id}`
        : '/api/admin/schools';
      
      const method = editingSchool ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(schoolData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save school');
      }

      setIsDialogOpen(false);
      await fetchSchools();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save school');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading schools...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        Error: {error}
        <Button onClick={fetchSchools} className="ml-4">Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">School Management</h1>
        <Button onClick={handleAddSchool}>Add New School</Button>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>District</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schools.map((school) => (
              <TableRow key={school.id}>
                <TableCell className="font-medium">{school.name}</TableCell>
                <TableCell>{school.district || 'N/A'}</TableCell>
                <TableCell>{school.city || 'N/A'}</TableCell>
                <TableCell>{school.state || 'N/A'}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEditSchool(school)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleDeleteSchool(school)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {schools.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No schools found.</p>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSchool ? 'Edit School' : 'Add New School'}
            </DialogTitle>
          </DialogHeader>
          <SchoolForm
            school={editingSchool}
            onSave={handleSaveSchool}
            onCancel={() => setIsDialogOpen(false)}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
