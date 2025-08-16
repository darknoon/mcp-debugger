#!/usr/bin/env python3
"""
Test scenarios for the order processing system.
Includes specific scenarios designed to trigger the race condition bug.
"""

import sys
import time
import random
import threading
import argparse
from datetime import datetime
from order_processor import OrderProcessor, Order, Customer


def stress_test(duration_seconds=10, num_threads=5):
    """
    Stress test that runs multiple concurrent orders for a specified duration.
    This is likely to trigger the race condition bug.
    """
    print(f"Starting stress test for {duration_seconds} seconds with {num_threads} threads...")
    processor = OrderProcessor()
    
    # Create a pool of customers
    customers = []
    for i in range(10):
        customer = processor.create_customer(f"STRESS_CUST{i:03d}", f"Stress Customer {i}")
        # Set some customers near VIP threshold
        if i < 3:
            customer.total_spent = random.uniform(900, 990)
            customer.loyalty_points = random.randint(4000, 4900)
        customers.append(customer)
    
    stop_flag = threading.Event()
    error_count = 0
    success_count = 0
    lock = threading.Lock()
    
    def worker_thread(thread_id):
        nonlocal error_count, success_count
        
        while not stop_flag.is_set():
            # Random customer
            customer = random.choice(customers)
            
            # Random products with quantities that stress inventory
            products = []
            num_products = random.randint(1, 4)
            available_products = ['LAPTOP001', 'PHONE001', 'BOOK001', 'HEADPHONES001', 'KEYBOARD001']
            
            for _ in range(num_products):
                product = random.choice(available_products)
                quantity = random.randint(1, 5)
                products.append((product, quantity))
            
            # Create and process order
            order = processor.create_order(
                customer.id,
                products,
                priority=random.randint(0, 2)
            )
            
            success = processor.process_order(order, customer)
            
            with lock:
                if success:
                    success_count += 1
                else:
                    error_count += 1
            
            # Small random delay
            time.sleep(random.uniform(0.001, 0.05))
    
    # Start worker threads
    threads = []
    for i in range(num_threads):
        thread = threading.Thread(target=worker_thread, args=(i,))
        thread.start()
        threads.append(thread)
    
    # Run for specified duration
    time.sleep(duration_seconds)
    stop_flag.set()
    
    # Wait for threads to finish
    for thread in threads:
        thread.join()
    
    print(f"\nStress test complete!")
    print(f"Successful orders: {success_count}")
    print(f"Failed orders: {error_count}")
    print(f"Final stats: {processor.get_processing_stats()}")
    
    # Check for bugs
    detect_bugs(processor)


def race_condition_scenario():
    """
    Specific scenario designed to trigger the race condition bug.
    This creates a situation where:
    1. Multiple customers are near VIP threshold
    2. Orders are processed that push them over the threshold
    3. Concurrent orders compete for the same inventory
    4. Discount calculations happen during status changes
    """
    print("Running race condition scenario...")
    processor = OrderProcessor()
    
    # Create customers near VIP threshold
    customer1 = processor.create_customer("RC_CUST001", "Alice")
    customer1.total_spent = 980.0  # $20 away from VIP
    customer1.loyalty_points = 4900
    
    customer2 = processor.create_customer("RC_CUST002", "Bob")
    customer2.total_spent = 975.0  # $25 away from VIP
    customer2.loyalty_points = 4800
    
    customer3 = processor.create_customer("RC_CUST003", "Charlie")
    customer3.total_spent = 990.0  # $10 away from VIP
    customer3.loyalty_points = 4950
    
    print(f"Customer 1 discount before: {customer1.get_loyalty_discount():.2%}")
    print(f"Customer 2 discount before: {customer2.get_loyalty_discount():.2%}")
    print(f"Customer 3 discount before: {customer3.get_loyalty_discount():.2%}")
    
    # Create orders that will push customers over VIP threshold
    orders = [
        # Customer 1 orders - will push over VIP threshold
        (processor.create_order(customer1.id, [('LAPTOP001', 2), ('PHONE001', 1)], priority=1), customer1),
        (processor.create_order(customer1.id, [('HEADPHONES001', 3)], priority=2), customer1),
        
        # Customer 2 orders - competing for same inventory
        (processor.create_order(customer2.id, [('LAPTOP001', 1), ('PHONE001', 2)], priority=1), customer2),
        (processor.create_order(customer2.id, [('KEYBOARD001', 2)], priority=0), customer2),
        
        # Customer 3 orders - will definitely cross VIP threshold
        (processor.create_order(customer3.id, [('BOOK001', 5), ('HEADPHONES001', 1)], priority=2), customer3),
        (processor.create_order(customer3.id, [('LAPTOP001', 1)], priority=1), customer3),
    ]
    
    # Process all orders concurrently
    threads = []
    for order, customer in orders:
        thread = threading.Thread(target=processor.process_order, args=(order, customer))
        threads.append(thread)
        thread.start()
        # Tiny delay to ensure threads are truly concurrent
        time.sleep(0.0001)
    
    # Wait for all to complete
    for thread in threads:
        thread.join()
    
    print(f"\nCustomer 1 discount after: {customer1.get_loyalty_discount():.2%}, VIP: {customer1.vip_status}")
    print(f"Customer 2 discount after: {customer2.get_loyalty_discount():.2%}, VIP: {customer2.vip_status}")
    print(f"Customer 3 discount after: {customer3.get_loyalty_discount():.2%}, VIP: {customer3.vip_status}")
    
    # Check for discount inconsistencies
    for customer in [customer1, customer2, customer3]:
        print(f"\n{customer.name}'s orders:")
        for order in customer.order_history:
            if order.total > 0:
                applied_rate = order.discount_applied / (order.total + order.discount_applied)
                print(f"  Order {order.id}: Total=${order.total:.2f}, Discount=${order.discount_applied:.2f} ({applied_rate:.2%})")
    
    detect_bugs(processor)


def inventory_exhaustion_scenario():
    """
    Scenario that attempts to exhaust inventory through concurrent orders.
    This can trigger negative inventory bugs.
    """
    print("Running inventory exhaustion scenario...")
    processor = OrderProcessor()
    
    # Set very limited inventory
    for warehouse in processor.warehouses.values():
        for product_id in processor.products:
            warehouse.inventory[product_id] = 5  # Very limited stock
    
    # Create many customers
    customers = [
        processor.create_customer(f"EXH_CUST{i:03d}", f"Customer {i}")
        for i in range(20)
    ]
    
    # Create orders that will compete for limited inventory
    threads = []
    for i in range(30):  # More orders than available inventory
        customer = customers[i % len(customers)]
        order = processor.create_order(
            customer.id,
            [('LAPTOP001', 2), ('PHONE001', 1)],  # Each order wants multiple items
            priority=random.randint(0, 2)
        )
        
        thread = threading.Thread(target=processor.process_order, args=(order, customer))
        threads.append(thread)
        thread.start()
    
    # Wait for completion
    for thread in threads:
        thread.join()
    
    print(f"\nProcessing stats: {processor.get_processing_stats()}")
    detect_bugs(processor)


def detect_bugs(processor):
    """Helper function to detect common symptoms of the race condition bug."""
    print("\n" + "="*50)
    print("BUG DETECTION REPORT")
    print("="*50)
    
    bugs_found = False
    
    # Check for negative inventory
    for warehouse_id, warehouse in processor.warehouses.items():
        for product_id, quantity in warehouse.inventory.items():
            if quantity < 0:
                print(f"❌ NEGATIVE INVENTORY: {warehouse_id} - {product_id}: {quantity}")
                bugs_found = True
    
    # Check for inconsistent reserved inventory
    for warehouse_id, warehouse in processor.warehouses.items():
        for product_id, reserved in warehouse.reserved.items():
            if reserved < 0:
                print(f"❌ NEGATIVE RESERVED: {warehouse_id} - {product_id}: {reserved}")
                bugs_found = True
            elif reserved > 0 and len(processor.pending_orders) == 0:
                print(f"⚠️  ORPHANED RESERVATION: {warehouse_id} - {product_id}: {reserved} (no pending orders)")
                bugs_found = True
    
    # Check for discount inconsistencies
    for customer in processor.customers.values():
        if customer.order_history:
            current_discount = customer.get_loyalty_discount()
            for order in customer.order_history:
                if order.total > 0:
                    applied_rate = order.discount_applied / (order.total + order.discount_applied)
                    # Check if discount rate makes sense given customer's current status
                    if customer.vip_status and applied_rate < 0.14:  # Should be 15%
                        print(f"⚠️  DISCOUNT INCONSISTENCY: {customer.name} (VIP) got {applied_rate:.2%} on order {order.id}")
                        bugs_found = True
    
    # Check stats consistency
    stats = processor.get_processing_stats()
    expected_total = stats['successful_orders'] + stats['failed_orders']
    if stats['total_orders'] != expected_total:
        print(f"❌ STATS MISMATCH: total_orders({stats['total_orders']}) != successful({stats['successful_orders']}) + failed({stats['failed_orders']})")
        bugs_found = True
    
    if not bugs_found:
        print("✅ No obvious bugs detected (but they might still be lurking!)")
    else:
        print("\n🐛 BUGS DETECTED! The race condition has manifested.")
    
    print("="*50)


def main():
    parser = argparse.ArgumentParser(description='Test the order processing system')
    parser.add_argument('--stress', action='store_true', help='Run stress test')
    parser.add_argument('--scenario', choices=['race_condition', 'inventory_exhaustion', 'all'],
                        help='Run specific scenario')
    parser.add_argument('--duration', type=int, default=10,
                        help='Duration for stress test in seconds')
    parser.add_argument('--threads', type=int, default=5,
                        help='Number of threads for stress test')
    
    args = parser.parse_args()
    
    if args.stress:
        stress_test(args.duration, args.threads)
    elif args.scenario == 'race_condition':
        race_condition_scenario()
    elif args.scenario == 'inventory_exhaustion':
        inventory_exhaustion_scenario()
    elif args.scenario == 'all':
        print("Running all scenarios...\n")
        race_condition_scenario()
        print("\n" + "="*70 + "\n")
        inventory_exhaustion_scenario()
        print("\n" + "="*70 + "\n")
        stress_test(5, 3)
    else:
        # Default: run the race condition scenario
        race_condition_scenario()


if __name__ == "__main__":
    main()