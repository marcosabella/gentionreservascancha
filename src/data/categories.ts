import { ConsumableCategory } from '../types';

export const initialCategories: ConsumableCategory[] = [
  
];

export const getCategoryColor = (color: string) => {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    pink: 'bg-pink-100 text-pink-800 border-pink-200',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    gray: 'bg-gray-100 text-gray-800 border-gray-200'
  };
  return colorMap[color as keyof typeof colorMap] || colorMap.gray;
};

export const availableColors = [
  { name: 'blue', label: 'Azul', class: 'bg-blue-500' },
  { name: 'orange', label: 'Naranja', class: 'bg-orange-500' },
  { name: 'cyan', label: 'Cian', class: 'bg-cyan-500' },
  { name: 'green', label: 'Verde', class: 'bg-green-500' },
  { name: 'purple', label: 'Morado', class: 'bg-purple-500' },
  { name: 'red', label: 'Rojo', class: 'bg-red-500' },
  { name: 'yellow', label: 'Amarillo', class: 'bg-yellow-500' },
  { name: 'pink', label: 'Rosa', class: 'bg-pink-500' },
  { name: 'indigo', label: 'Índigo', class: 'bg-indigo-500' },
  { name: 'gray', label: 'Gris', class: 'bg-gray-500' }
];