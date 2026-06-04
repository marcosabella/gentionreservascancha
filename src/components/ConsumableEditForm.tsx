import React, { useState } from 'react';
import { Save, X, Package, Utensils, Coffee, Tag, Dumbbell, Gamepad2, Shirt, Zap, Droplets, Apple, Sandwich, Pizza, Cookie, Wine, Beer, Gift, Wrench, Shield, Heart, Settings } from 'lucide-react';
import { ConsumableItem, ConsumableCategory } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import { getCategoryColor } from '../data/categories';
import CategoryManagementModal from './CategoryManagementModal';

interface ConsumableEditFormProps {
  consumable?: ConsumableItem;
  categories: ConsumableCategory[];
  onSave: (consumable: Omit<ConsumableItem, 'id'> & { id?: string }) => void;
  onCategoriesUpdate: (categories: ConsumableCategory[]) => void;
  onCancel: () => void;
}

const ConsumableEditForm: React.FC<ConsumableEditFormProps> = ({ 
  consumable, 
  categories, 
  onSave, 
  onCategoriesUpdate, 
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    name: consumable?.name || '',
    description: consumable?.description || '',
    price: consumable?.price || 0,
    category: consumable?.category || 'other',
    available: consumable?.available ?? true,
    icon: consumable?.icon || 'Package'
  });
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const consumableData = {
      ...formData,
      id: consumable?.id
    };
    
    onSave(consumableData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : 
               type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
               value
    }));
  };


  const handleCategoryChange = (newCategory: string) => {
    const categoryOption = categories.find(cat => cat.name === newCategory);
    setFormData(prev => ({
      ...prev,
      category: newCategory,
      icon: categoryOption?.defaultIcon || 'Package'
    }));
  };

  const getIconComponent = (iconName: string) => {
    const iconData = iconOptions.find(icon => icon.name === iconName);
    return iconData ? iconData.icon : Package;
  };

  const getCurrentCategoryIcons = () => {
    return iconOptions;
  };

  const getCurrentCategory = () => {
    return categories.find(cat => cat.name === formData.category);
  };

  const handleCategoriesUpdate = (updatedCategories: ConsumableCategory[]) => {
    onCategoriesUpdate(updatedCategories);
    setShowCategoryManagement(false);
  };

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {consumable ? 'Editar Consumible' : 'Nuevo Consumible'}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Producto
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Ej: Pelotas de Padel (x3)"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none"
                placeholder="Describe el producto o servicio"
              />
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Categoría
                </label>
                <button
                  type="button"
                  onClick={() => setShowCategoryManagement(true)}
                  className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Gestionar</span>
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  name="category"
                  value={formData.category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  required
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  {categories.map(category => (
                    <option key={category.id} value={category.name}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Icon Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icono
              </label>
              <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
                {getCurrentCategoryIcons().map(iconOption => {
                  const IconComponent = iconOption.icon;
                  const isSelected = formData.icon === iconOption.name;
                  
                  return (
                    <button
                      key={iconOption.name}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, icon: iconOption.name }))}
                      className={`p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                        isSelected
                          ? 'border-green-500 bg-green-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      title={iconOption.label}
                    >
                      <IconComponent className={`w-6 h-6 mx-auto ${
                        isSelected ? 'text-green-600' : 'text-gray-600'
                      }`} />
                      <p className={`text-xs mt-1 ${
                        isSelected ? 'text-green-700 font-medium' : 'text-gray-500'
                      }`}>
                        {iconOption.label}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Los iconos disponibles cambian según la categoría seleccionada
              </p>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  required
                  min="0"
                  step="50"
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="300"
                />
              </div>
              {formData.price > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  Precio: {formatCurrency(formData.price)}
                </p>
              )}
            </div>

            {/* Available */}
            <div>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  name="available"
                  checked={formData.available}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Disponible para reservas
                </span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Los productos no disponibles no aparecerán en el formulario de reservas
              </p>
            </div>

            {/* Preview */}
            {formData.name && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Vista Previa</h4>
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    getCurrentCategory() ? getCategoryColor(getCurrentCategory()!.color) : 'bg-gray-100'
                  }`}>
                    {React.createElement(getIconComponent(formData.icon), {
                      className: "w-6 h-6"
                    })}
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900">{formData.name}</h5>
                    <p className="text-sm text-gray-600">{formData.description}</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(formData.price)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>{consumable ? 'Guardar Cambios' : 'Crear Consumible'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    {/* Category Management Modal */}
    {showCategoryManagement && (
      <CategoryManagementModal
        categories={categories}
        onSave={handleCategoriesUpdate}
        onClose={() => setShowCategoryManagement(false)}
      />
    )}
    </>
  );
};

export default ConsumableEditForm;