# Claude Debugger MCP Demo - Order Processing System

## Overview

This demo showcases a Python order processing system with a subtle, hard-to-trigger bug that demonstrates the value of using the Claude Debugger MCP. The bug only manifests under specific conditions involving concurrent operations and state management.

## The Application

The `order_processor.py` implements an e-commerce order processing system that:
- Manages inventory across multiple warehouses
- Processes orders with priority handling
- Applies dynamic discounts based on order history
- Handles concurrent order processing
- Maintains audit logs

## The Bug

The application contains a **race condition** bug that occurs when:
1. Multiple orders are processed concurrently
2. The same product is ordered from different warehouses
3. A customer qualifies for a loyalty discount during processing
4. The total order value crosses a specific threshold

This combination of conditions causes:
- Inventory count inconsistencies
- Incorrect discount calculations
- Potential negative inventory in rare cases

The bug is particularly challenging because:
- It only occurs under specific timing conditions
- The symptoms appear in different parts of the system
- Standard logging doesn't capture the root cause
- It requires understanding the interaction between multiple components

## Running the Demo

### Basic Usage
```bash
python order_processor.py
```

### Triggering the Bug
```bash
# Run the stress test that attempts to trigger the race condition
python test_orders.py --stress

# Run with specific scenario that often triggers the bug
python test_orders.py --scenario race_condition
```

### Using the Debugger

The Claude Debugger MCP is perfect for this scenario because:
1. You can set conditional breakpoints when specific order patterns occur
2. You can inspect the state of multiple threads simultaneously
3. You can trace the execution path through the complex discount calculation
4. You can monitor variable changes across different components

Example debugging session:
```python
# Set a breakpoint when inventory drops below threshold
debugger.break_when("warehouse.inventory[product_id] < 5")

# Watch for race condition patterns
debugger.watch("self.pending_orders", callback=check_concurrent_access)

# Trace discount calculation anomalies
debugger.trace_function("calculate_loyalty_discount", log_args=True)
```

## File Structure

- `order_processor.py` - Main application with the hidden bug
- `test_orders.py` - Test scenarios including bug triggers
- `warehouse.py` - Warehouse inventory management
- `customer.py` - Customer and loyalty system
- `utils.py` - Utility functions and helpers

## The Challenge

Can you find and fix the bug using the Claude Debugger MCP? The bug is subtle and requires understanding:
- Thread synchronization issues
- State management across components
- The interaction between inventory and discount systems
- Timing-dependent code execution

Good luck debugging!