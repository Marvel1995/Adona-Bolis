/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Shell from './components/layout/Shell';
import Dashboard from './components/dashboard/Dashboard';
import InventoryManager from './components/inventory/InventoryManager';
import RecipeManager from './components/production/RecipeManager';
import ProductionBatchManager from './components/production/ProductionBatchManager';
import SalesManager from './components/sales/SalesManager';
import FinanceManager from './components/finances/FinanceManager';
import CustomerManager from './components/customers/CustomerManager';
import SettingsManager from './components/settings/SettingsManager';
import OrderManager from './components/orders/OrderManager';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'inventory': return <InventoryManager />;
      case 'recipes': return <RecipeManager />;
      case 'production': return <ProductionBatchManager />;
      case 'sales': return <SalesManager />;
      case 'orders': return <OrderManager />;
      case 'finances': return <FinanceManager />;
      case 'customers': return <CustomerManager />;
      case 'settings': return <SettingsManager />;
      default: return <Dashboard />;
    }
  };

  return (
    <Shell activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Shell>
  );
}

