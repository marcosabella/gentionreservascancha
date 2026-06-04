import React from 'react';
import { ShoppingCart, Edit, Trash2, Plus, Package, Utensils, Coffee, Tag, Eye, Dumbbell, Gamepad2, Shirt, Zap, Droplets, Apple, Sandwich, Pizza, Cookie, Wine, Beer, Gift, Wrench, Shield, Heart } from 'lucide-react';
import { ConsumableItem, ConsumableCategory } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import { getCategoryColor } from '../data/categories';

interface ConsumableListProps {
  consumables: ConsumableItem[];
  categories: ConsumableCategory[];
  onEditConsumable: (consumable: ConsumableItem) => void;
  onDeleteConsumable: (consumableId: string) => void;
  onAddConsumable: () => void;
}

const iconMap = {
  Package, Utensils, Coffee, Tag, Dumbbell, Gamepad2, Shirt, Zap, 
  Droplets, Apple, Sandwich, Pizza, Cookie, Wine, Beer, Gift, 
  Wrench, Shield, Heart
};

const ConsumableList: React.FC<ConsumableListProps> = ({ 
  consumables, 
  categories,
  onEditConsumable, 
  onDeleteConsumable, 
  onAddConsumable 
}) => {
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
    return category ? getCategoryColor(category.color) : 'bg-gray-100 text-gray-800';
  };

  // Agrupar estadísticas por categorías dinámicas
  const categoryStats = categories.map(category => ({
    ...category,
    count: consumables.filter(c => c.category === category.name).length
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Consumibles</h2>
          <p className="text-gray-600">Administra productos y servicios adicionales</p>
        </div>
        <button
          onClick={onAddConsumable}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Consumible</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {categoryStats.slice(0, 3).map(category => (
          <div key={category.id} className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(category.color)}`}>
                {React.createElement(iconMap[category.defaultIcon as keyof typeof iconMap] || Package, { className: "w-5 h-5" })}
              </div>
              <div>
                <p className="text-sm text-gray-600">{category.label}</p>
                <p className="text-xl font-bold text-gray-900">{category.count}</p>
              </div>
            </div>
          </div>
        ))}
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-bold text-gray-900">{consumables.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Consumables Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Producto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Categoría
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {consumables.map(consumable => (
                <tr key={consumable.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getConsumableCategoryColor(consumable.category)}`}>
                        {React.createElement(getConsumableIcon(consumable), { className: "w-5 h-5" })}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{consumable.name}</div>
                        <div className="text-sm text-gray-500">{consumable.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConsumableCategoryColor(consumable.category)}`}>
                      {getCategoryLabel(consumable.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(consumable.price)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-2 ${consumable.available ? 'bg-green-400' : 'bg-red-400'}`}></div>
                      <span className={`text-sm font-medium ${consumable.available ? 'text-green-700' : 'text-red-700'}`}>
                        {consumable.available ? 'Disponible' : 'No disponible'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => onEditConsumable(consumable)}
                      className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title="Editar consumible"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteConsumable(consumable.id)}
                      className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title="Eliminar consumible"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {consumables.length === 0 && (
          <div className="text-center py-12">
            <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay consumibles registrados</h3>
            <p className="text-gray-600">Comienza agregando tu primer consumible</p>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Información del Sistema</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><strong>Productos disponibles:</strong> {consumables.filter(c => c.available).length}</p>
            <p><strong>Productos inactivos:</strong> {consumables.filter(c => !c.available).length}</p>
          </div>
          <div>
            <p><strong>Precio promedio:</strong> {formatCurrency(consumables.reduce((sum, c) => sum + c.price, 0) / consumables.length || 0)}</p>
            <p><strong>Total de productos:</strong> {consumables.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsumableList;