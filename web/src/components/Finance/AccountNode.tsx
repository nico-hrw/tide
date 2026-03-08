import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Wallet, Building, ShoppingCart, ArrowRightLeft } from 'lucide-react';

export default function AccountNode({ data, isConnectable }: NodeProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    // Determine icon based on type
    const getIcon = () => {
        switch (data.type) {
            case 'asset':
                return <Building className="w-4 h-4 text-blue-500" />;
            case 'expense':
                return <ShoppingCart className="w-4 h-4 text-red-500" />;
            case 'income':
                return <Wallet className="w-4 h-4 text-green-500" />;
            default:
                return <ArrowRightLeft className="w-4 h-4 text-gray-500" />;
        }
    };

    return (
        <div className="group relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 min-w-[160px] transition-all hover:shadow-md">
            {/* Handles - visible on hover */}
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-blue-500 border-2 border-white dark:border-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"
            />

            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        {getIcon()}
                    </div>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {data.label as string}
                    </span>
                </div>
                <div className="mt-1">
                    <span className={`text-lg font-bold ${(data.balance as number) < 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                        {formatCurrency(data.balance as number)}
                    </span>
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-blue-500 border-2 border-white dark:border-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"
            />
        </div>
    );
}
