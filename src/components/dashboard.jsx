import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, H1, H3, Text } from '@adminjs/design-system';

const cards = [
  ['Orders', 'orders', '#2563eb'],
  ['Customers', 'customers', '#16a34a'],
  ['Products', 'products', '#9333ea'],
  ['Active banners', 'banners', '#ea580c'],
];

const api = new ApiClient();

const Dashboard = () => {
  const [data, setData] = useState({ orders: 0, customers: 0, products: 0, banners: 0, revenue: 0 });

  useEffect(() => {
    api.getDashboard().then(response => setData(response.data));
  }, []);

  const { orders, customers, products, banners, revenue } = data;

  return (
  <Box variant="grey">
    <Box mb="xl">
      <H1> Chutki — Groceries in a Snap</H1>
      <Text>Store performance and content overview</Text>
    </Box>

    <Box display="flex" flexWrap="wrap" mx="-12px">
      {cards.map(([label, key, color]) => (
        <Box key={key} width={[1, 1 / 2, 1 / 4]} px="12px" mb="24px">
          <Box bg="white" p="xl" borderRadius="lg" boxShadow="card">
            <Text color="grey60">{label}</Text>
            <H1 style={{ color, marginTop: 8 }}>{({ orders, customers, products, banners })[key]}</H1>
          </Box>
        </Box>
      ))}
    </Box>

    <Box bg="white" p="xl" borderRadius="lg" boxShadow="card">
      <Text color="grey60">Total order value</Text>
      <H3 mt="md">₹{Number(revenue).toLocaleString('en-IN')}</H3>
      <Text mt="lg">Use the sidebar to manage orders, products, customers and carousel banners.</Text>
    </Box>
  </Box>
  );
};

export default Dashboard;
