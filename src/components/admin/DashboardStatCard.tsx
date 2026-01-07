"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardStatCardProps {
  title: string;
  value: number | string;
  description: string;
  icon: LucideIcon;
  iconBgColor: string; // Tailwind class for background color, e.g., 'bg-blue-100'
  iconColor: string; // Tailwind class for icon color, e.g., 'text-blue-600'
  valueColor: string; // Tailwind class for value color, e.g., 'text-blue-600'
}

const DashboardStatCard = ({
  title,
  value,
  description,
  icon: Icon,
  iconBgColor,
  iconColor,
  valueColor,
}: DashboardStatCardProps) => {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn("rounded-full p-2", iconBgColor)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", valueColor)}>{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

export default DashboardStatCard;