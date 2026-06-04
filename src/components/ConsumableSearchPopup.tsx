import React, { useState } from 'react';
import { Search, X, Package, Plus, Check, Utensils, Coffee, Tag, Dumbbell, Gamepad2, Shirt, Zap, Droplets, Apple, Sandwich, Pizza, Cookie, Wine, Beer, Gift, Wrench, Shield, Heart } from 'lucide-react';
import { ConsumableItem, ConsumableCategory } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import { getCategoryColor } from '../data/categories';

interface ConsumableSearchPopupProps {
  consumables: ConsumableItem[];
  categories: ConsumableCategory[];
  onConsumableSelect: (consumable: ConsumableItem) => void;
  onClose: () => void;
}

const iconMap = {
  Package, Utensils, Coffee, Tag, Dumbbell, Gamepad2, Shirt, Zap, 
  Droplets, Apple, Sandwich, Pizza, Cookie, Wine, Beer, Gift, 
  Wrench, Shield, Heart
};

const ConsumableSearchPopup: React.FC<ConsumableSearchPopupProps> = ({
  consumables,
  categories,
  onConsumableSelect,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const getCategoryIcon = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    if (category?.defaultIcon && iconMap[category.defaultIcon as keyof typeof iconMap]) {
      return iconMap[category.defaultIcon as keyof typeof iconMap];
    }
    return Package;
  };

  const getConsumableIcon = (consumable: ConsumableItem) => {
    if (consumable.icon && iconMap[consumable.icon as keyof typeof iconMap]) {
      return iconMap[consumable.icon as keyof typeof iconMap];
    }
    return getCategoryIcon(consumable.category);
  };

  const getCategoryLabel = (category: string) => {
    const categoryData = categories.find(cat => cat.name === category);
    return categoryData?.label || 'Sin categoría';
  };

  const getConsumableCategoryColor = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? getCategoryColor(category.color) + ' border' : 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const filteredConsumables = consumables.filter(consumable => {
    if (!consumable.available) return false;
    
    const matchesSearch = consumable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         consumable.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || consumable.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categoryOptions = [
    { value: 'all', label: 'Todas las categorías', count: consumables.filter(c => c.available).length },
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.label,
      count: consumables.filter(c => c.available && c.category === cat.name).length
    }))
  ].filter(cat => cat.count > 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Seleccionar Consumible</h2>
              <p className="text-gray-600">Busca y selecciona productos disponibles</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            >
              {categoryOptions.map(category => (
                <option key={category.value} value={category.value}>
                  {category.label} ({category.count})
                </option>
              ))}
            </select>
          </div>

          {/* Results Count */}
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              {filteredConsumables.length} producto{filteredConsumables.length !== 1 ? 's' : ''} encontrado{filteredConsumables.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Consumables Grid */}
          <div className="max-h-96 overflow-y-auto">
            {filteredConsumables.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No se encontraron productos
                </h3>
                <p className="text-gray-600">
                  {searchTerm || selectedCategory !== 'all' 
                    ? 'Intenta con otros términos de búsqueda o filtros' 
                    : 'No hay productos disponibles'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredConsumables.map(consumable => (
                  <div
                    key={consumable.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:bg-green-50 cursor-pointer transition-all group"
                    onClick={() => onConsumableSelect(consumable)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getConsumableCategoryColor(consumable.category)}`}>
                          {React.createElement(getConsumableIcon(consumable), { className: "w-5 h-5" })}
                        </div>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConsumableCategoryColor(consumable.category)}`}>
                          {getCategoryLabel(consumable.category)}
                        </span>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Plus className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>

                    <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-green-700 transition-colors">
                      {consumable.name}
                    </h3>
                    
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {consumable.description}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(consumable.price)}
                      </div>
                      <button className="text-sm bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition-colors opacity-0 group-hover:opacity-100">
                        Agregar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t mt-6">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsumableSearchPopup;