#!/usr/bin/env python3
"""
Order Processing System with a subtle race condition bug.
The bug occurs when concurrent orders interact with the loyalty discount system.
"""

import threading
import time
import random
from datetime import datetime
from typing import Dict, List, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import json
import logging
import sys

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s.%(msecs)03d [%(threadName)-10s] %(levelname)-8s %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.FileHandler('order_processing.log', mode='w'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


@dataclass
class Product:
    id: str
    name: str
    price: float
    category: str


@dataclass
class Order:
    id: str
    customer_id: str
    products: List[Tuple[str, int]]  # (product_id, quantity)
    timestamp: datetime
    priority: int = 0
    discount_applied: float = 0.0
    total: float = 0.0
    warehouse_allocations: Dict[str, Dict[str, int]] = field(default_factory=dict)


class Warehouse:
    def __init__(self, warehouse_id: str, location: str):
        self.id = warehouse_id
        self.location = location
        self.inventory = defaultdict(int)
        self.reserved = defaultdict(int)
        self.lock = threading.Lock()
    
    def add_inventory(self, product_id: str, quantity: int):
        with self.lock:
            self.inventory[product_id] += quantity
    
    def check_availability(self, product_id: str, quantity: int) -> bool:
        # Not checking reserved inventory
        return self.inventory[product_id] >= quantity
    
    def reserve_items(self, product_id: str, quantity: int) -> bool:
        # Partial lock - potential race condition
        if self.check_availability(product_id, quantity):
            with self.lock:
                self.inventory[product_id] -= quantity
                self.reserved[product_id] += quantity
                return True
        return False
    
    def commit_reservation(self, product_id: str, quantity: int):
        with self.lock:
            self.reserved[product_id] -= quantity
    
    def cancel_reservation(self, product_id: str, quantity: int):
        with self.lock:
            self.inventory[product_id] += quantity
            self.reserved[product_id] -= quantity


class Customer:
    def __init__(self, customer_id: str, name: str):
        self.id = customer_id
        self.name = name
        self.order_history = []
        self.total_spent = 0.0
        self.loyalty_points = 0
        self.vip_status = False
    
    def add_order(self, order: Order):
        self.order_history.append(order)
        self.total_spent += order.total
        self.loyalty_points += int(order.total * 10)
        
        # VIP status upgrade
        if self.total_spent > 1000 and not self.vip_status:
            self.vip_status = True
    
    def get_loyalty_discount(self) -> float:
        if self.vip_status:
            return 0.15
        elif self.loyalty_points > 5000:
            return 0.10
        elif self.loyalty_points > 1000:
            return 0.05
        return 0.0


class OrderProcessor:
    def __init__(self):
        self.products = {}
        self.warehouses = {}
        self.customers = {}
        self.orders = []
        self.pending_orders = []
        self.processing_lock = threading.RLock()
        self.stats_lock = threading.Lock()
        self.order_counter = 0
        self.processing_stats = {
            'total_orders': 0,
            'successful_orders': 0,
            'failed_orders': 0,
            'total_revenue': 0.0
        }
        self._init_demo_data()
    
    def _init_demo_data(self):
        # Initialize products
        self.products = {
            'LAPTOP001': Product('LAPTOP001', 'Gaming Laptop', 1299.99, 'Electronics'),
            'PHONE001': Product('PHONE001', 'Smartphone', 899.99, 'Electronics'),
            'BOOK001': Product('BOOK001', 'Python Programming', 49.99, 'Books'),
            'HEADPHONES001': Product('HEADPHONES001', 'Wireless Headphones', 199.99, 'Electronics'),
            'KEYBOARD001': Product('KEYBOARD001', 'Mechanical Keyboard', 149.99, 'Electronics'),
        }
        
        # Initialize warehouses
        self.warehouses = {
            'WH001': Warehouse('WH001', 'New York'),
            'WH002': Warehouse('WH002', 'Los Angeles'),
            'WH003': Warehouse('WH003', 'Chicago'),
        }
        
        # Stock warehouses
        for warehouse in self.warehouses.values():
            for product_id in self.products:
                warehouse.add_inventory(product_id, random.randint(10, 50))
    
    def create_customer(self, customer_id: str, name: str) -> Customer:
        if customer_id not in self.customers:
            self.customers[customer_id] = Customer(customer_id, name)
        return self.customers[customer_id]
    
    def calculate_order_total(self, order: Order, customer: Customer) -> float:
        subtotal = 0.0
        for product_id, quantity in order.products:
            if product_id in self.products:
                subtotal += self.products[product_id].price * quantity
        
        # Customer discount can change during calculation
        discount_rate = customer.get_loyalty_discount()
        
        # Simulate some processing time where race condition can occur
        time.sleep(0.001)
        
        # Apply discount
        discount_amount = subtotal * discount_rate
        total = subtotal - discount_amount
        
        order.discount_applied = discount_amount
        order.total = total
        
        return total
    
    def allocate_inventory(self, order: Order) -> bool:
        allocations = {}
        
        for product_id, quantity in order.products:
            remaining = quantity
            product_allocations = {}
            
            # Try to allocate from warehouses (priority based on availability)
            for warehouse_id, warehouse in self.warehouses.items():
                if remaining <= 0:
                    break
                
                available = min(remaining, warehouse.inventory[product_id])
                if available > 0:
                    # Not using proper locking between check and reserve
                    if warehouse.reserve_items(product_id, available):
                        product_allocations[warehouse_id] = available
                        remaining -= available
            
            if remaining > 0:
                # Rollback all allocations for this order
                for wh_id, alloc_qty in product_allocations.items():
                    self.warehouses[wh_id].cancel_reservation(product_id, alloc_qty)
                return False
            
            allocations[product_id] = product_allocations
        
        order.warehouse_allocations = allocations
        return True
    
    def process_order(self, order: Order, customer: Customer) -> bool:
        try:
            # Add to pending orders
            with self.processing_lock:
                self.pending_orders.append(order)
            
            # Calculate total (potential race condition with loyalty status)
            total = self.calculate_order_total(order, customer)
            
            # Allocate inventory (potential race condition with concurrent orders)
            if not self.allocate_inventory(order):
                with self.processing_lock:
                    self.pending_orders.remove(order)
                return False
            
            # Commit the order
            for product_id, allocations in order.warehouse_allocations.items():
                for warehouse_id, quantity in allocations.items():
                    self.warehouses[warehouse_id].commit_reservation(product_id, quantity)
            
            # Update customer (customer state can be inconsistent)
            customer.add_order(order)
            
            # Update stats
            with self.stats_lock:
                self.processing_stats['total_orders'] += 1
                self.processing_stats['successful_orders'] += 1
                self.processing_stats['total_revenue'] += total
            
            # Remove from pending
            with self.processing_lock:
                self.pending_orders.remove(order)
                self.orders.append(order)
            
            return True
            
        except Exception as e:
            print(f"Error processing order {order.id}: {e}")
            with self.stats_lock:
                self.processing_stats['failed_orders'] += 1
            return False
    
    def process_order_async(self, order: Order, customer: Customer):
        thread = threading.Thread(target=self.process_order, args=(order, customer))
        thread.start()
        return thread
    
    def create_order(self, customer_id: str, products: List[Tuple[str, int]], priority: int = 0) -> Order:
        with self.processing_lock:
            self.order_counter += 1
            order_id = f"ORD{self.order_counter:06d}"
        
        order = Order(
            id=order_id,
            customer_id=customer_id,
            products=products,
            timestamp=datetime.now(),
            priority=priority
        )
        return order
    
    def get_inventory_status(self) -> Dict:
        status = {}
        for warehouse_id, warehouse in self.warehouses.items():
            status[warehouse_id] = {
                'location': warehouse.location,
                'inventory': dict(warehouse.inventory),
                'reserved': dict(warehouse.reserved)
            }
        return status
    
    def get_processing_stats(self) -> Dict:
        with self.stats_lock:
            return self.processing_stats.copy()


def simulate_concurrent_orders():
    """Simulate a scenario that triggers the race condition bug."""
    processor = OrderProcessor()
    
    # Create customers
    customers = [
        processor.create_customer(f"CUST{i:03d}", f"Customer {i}")
        for i in range(5)
    ]
    
    # Make some customers approach VIP status
    for customer in customers[:2]:
        customer.total_spent = 950  # Just below VIP threshold
        customer.loyalty_points = 4500
    
    print("Starting concurrent order processing simulation...")
    print("Initial inventory:", json.dumps(processor.get_inventory_status(), indent=2))
    
    threads = []
    orders_to_process = []
    
    # Create orders that will compete for the same inventory
    for i in range(10):
        customer = customers[i % len(customers)]
        
        # Create orders with overlapping products
        products = [
            ('LAPTOP001', random.randint(1, 3)),
            ('PHONE001', random.randint(1, 2)),
        ]
        
        if i % 3 == 0:
            products.append(('HEADPHONES001', 2))
        
        order = processor.create_order(
            customer.id,
            products,
            priority=random.randint(0, 2)
        )
        orders_to_process.append((order, customer))
    
    # Process orders concurrently
    for order, customer in orders_to_process:
        thread = processor.process_order_async(order, customer)
        threads.append(thread)
        # Small delay to increase chance of race condition
        time.sleep(random.uniform(0.001, 0.01))
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    print("\nProcessing complete!")
    print("Final stats:", json.dumps(processor.get_processing_stats(), indent=2))
    print("Final inventory:", json.dumps(processor.get_inventory_status(), indent=2))
    
    # Check for inconsistencies (symptoms of the bug)
    total_inventory = 0
    negative_inventory = []
    
    for warehouse_id, warehouse in processor.warehouses.items():
        for product_id, quantity in warehouse.inventory.items():
            total_inventory += quantity
            if quantity < 0:
                negative_inventory.append((warehouse_id, product_id, quantity))
    
    if negative_inventory:
        print("\n⚠️  ISSUE DETECTED: Negative inventory found!")
        for wh, prod, qty in negative_inventory:
            print(f"  - {wh}: {prod} = {qty}")
    
    # Check customer consistency
    for customer in customers:
        expected_discount = customer.get_loyalty_discount()
        for order in customer.order_history:
            if order.discount_applied > 0:
                actual_discount_rate = order.discount_applied / (order.total + order.discount_applied)
                if abs(actual_discount_rate - expected_discount) > 0.01:
                    print(f"\n⚠️  ISSUE DETECTED: Inconsistent discount for {customer.name}")
                    print(f"  Expected: {expected_discount:.2%}, Got: {actual_discount_rate:.2%}")
    
    return processor


if __name__ == "__main__":
    simulate_concurrent_orders()