import React, { useState } from 'react';
import { Save, X, Plus, Edit, Trash2, Tag, Package, Utensils, Coffee, Dumbbell, Gamepad2, Shirt, Zap, Droplets, Apple, Sandwich, Pizza, Cookie, Wine, Beer, Gift, Wrench, Shield, Heart } from 'lucide-react';
import { ConsumableCategory } from '../types';
import { availableColors, getCategoryColor } from '../data/categories';

interface CategoryManagementModalProps {
  categories: ConsumableCategory[];
  onSave: (categories: ConsumableCategory[]) => void;
  onClose: () => void;
}

const iconOptions = [
  { name: 'Package', icon: Package, label: 'Paquete' },
  { name: 'Utensils', icon: Utensils, label: 'Cubiertos' },
  { name: 'Coffee', icon: Coffee, label: 'Café' },
  { name: 'Tag', icon: Tag, label: 'Etiqueta' },
  { name: 'Dumbbell', icon: Dumbbell, label: 'Pesas' },
  { name: 'Gamepad2', icon: Gamepad2, label: 'Juego' },
  { name: 'Shirt', icon: Shirt, label: 'Ropa' },
  { name: 'Zap', icon: Zap, label: 'Energía' },
  { name: 'Droplets', icon: Droplets, label: 'Agua' },
  { name: 'Apple', icon: Apple, label: 'Fruta' },
  { name: 'Sandwich', icon: Sandwich, label: 'Sandwich' },
  { name: 'Pizza', icon: Pizza, label: 'Pizza' },
  { name: 'Cookie', icon: Cookie, label: 'Snack' },
  { name: 'Wine', icon: Wine, label: 'Copa' },
  { name: 'Beer', icon: Beer, label: 'Cerveza' },
  { name: 'Gift', icon: Gift, label: 'Regalo' },
  { name: 'Wrench', icon: Wrench, label: 'Herramienta' },
  { name: 'Shield', icon: Shield, label: 'Protección' },
  { name: 'Heart', icon: Heart, label: 'Saludable' }
];

const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  categories,
  onSave,
  onClose
}) => {
  const [localCategories, setLocalCategories] = useState<ConsumableCategory[]>([...categories]);
  const [editingCategory, setEditingCategory] = useState<ConsumableCategory | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    color: 'blue',
    defaultIcon: 'Package'
  });

  const handleAddCategory = () => {
    setFormData({
      name: '',
      label: '',
      color: 'blue',
      defaultIcon: 'Package'
    });
    setEditingCategory(null);
    setShowForm(true);
  };

  const handleEditCategory = (category: ConsumableCategory) => {
    setFormData({
      name: category.name,
      label: category.label,
      color: category.color,
      defaultIcon: category.defaultIcon
    });
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleSaveCategory = () => {
    if (!formData.name.trim() || !formData.label.trim()) {
      alert('El nombre y la etiqueta son obligatorios');
      return;
    }

    // Verificar que el nombre no esté duplicado
    const normalizedName = formData.name.trim().toLowerCase().replace(/\s+/g, '_');
    const categoryData = {
      ...formData,
      name: normalizedName,
      label: formData.label.trim()
    };

    const isDuplicate = localCategories.some(cat => 
      cat.name.toLowerCase() === normalizedName && 
      cat.id !== editingCategory?.id
    );

    if (isDuplicate) {
      alert('Ya existe una categoría con ese nombre');
      return;
    }

    if (editingCategory) {
      // Editar categoría existente
      setLocalCategories(prev => prev.map(cat =>
        cat.id === editingCategory.id
          ? { ...cat, ...categoryData }
          : cat
      ));
    } else {
      // Agregar nueva categoría
      const newCategory: ConsumableCategory = {
        id: Date.now().toString(),
        ...categoryData,
        createdAt: new Date().toISOString()
      };
      setLocalCategories(prev => [...prev, newCategory]);
    }

    setShowForm(false);
    setEditingCategory(null);
  };

  const handleDeleteCategory = (categoryId: string) => {
    // No permitir eliminar si es una categoría base
    const category = localCategories.find(c => c.id === categoryId);
    if (category && ['equipment', 'food', 'drink', 'other'].includes(category.name)) {
      alert('No se pueden eliminar las categorías base del sistema');
      return;
    }

    if (confirm('¿Estás seguro de que quieres eliminar esta categoría?\n\nLos consumibles que usen esta categoría quedarán sin categoría asignada.')) {
      setLocalCategories(prev => prev.filter(cat => cat.id !== categoryId));
    }
  };

  const getIconComponent = (iconName: string) => {
    const iconData = iconOptions.find(icon => icon.name === iconName);
    return iconData ? iconData.icon : Package;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Gestión de Categorías</h2>
              <p className="text-gray-600">Administra las categorías de consumibles</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {!showForm ? (
            <>
              {/* Lista de Categorías */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Categorías Existentes</h3>
                  <button
                    onClick={handleAddCategory}
                    className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nueva Categoría</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {localCategories.map(category => (
                    <div key={category.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(category.color)}`}>
                            {React.createElement(getIconComponent(category.defaultIcon), { className: "w-5 h-5" })}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{category.label}</h4>
                            <p className="text-sm text-gray-500">ID: {category.name}</p>
                          </div>
                        </div>
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditCategory(category)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {!['equipment', 'food', 'drink', 'other'].includes(category.name) && (
                            <button
                              onClick={() => handleDeleteCategory(category.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(category.color)}`}>
                        {category.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Formulario de Categoría */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                  </h3>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Nombre */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre de la Categoría
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="ej: accesorios"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Se usará como identificador interno (se convertirá a minúsculas)
                    </p>
                  </div>

                  {/* Etiqueta */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Etiqueta Visible
                    </label>
                    <input
                      type="text"
                      value={formData.label}
                      onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="ej: Accesorios"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Texto que se mostrará en la interfaz
                    </p>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Color de la Categoría
                    </label>
                    <div className="grid grid-cols-5 gap-3">
                      {availableColors.map(color => (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, color: color.name }))}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            formData.color === color.name
                              ? 'border-gray-400 shadow-md'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-6 h-6 ${color.class} rounded-full mx-auto mb-1`}></div>
                          <p className="text-xs text-gray-600">{color.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Icono por Defecto */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Icono por Defecto
                    </label>
                    <div className="grid grid-cols-6 md:grid-cols-10 gap-2">
                      {iconOptions.map(iconOption => {
                        const IconComponent = iconOption.icon;
                        const isSelected = formData.defaultIcon === iconOption.name;
                        
                        return (
                          <button
                            key={iconOption.name}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, defaultIcon: iconOption.name }))}
                            className={`p-2 rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'border-green-500 bg-green-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                            title={iconOption.label}
                          >
                            <IconComponent className={`w-5 h-5 mx-auto ${
                              isSelected ? 'text-green-600' : 'text-gray-600'
                            }`} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vista Previa */}
                  {formData.label && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Vista Previa</h4>
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(formData.color)}`}>
                          {React.createElement(getIconComponent(formData.defaultIcon), { className: "w-5 h-5" })}
                        </div>
                        <div>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(formData.color)}`}>
                            {formData.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Save className="w-5 h-5" />
                    <span>{editingCategory ? 'Actualizar' : 'Crear'} Categoría</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Botones Principales */}
          {!showForm && (
            <div className="flex space-x-3 pt-4 border-t">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => onSave(localCategories)}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>Guardar Cambios</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryManagementModal;
