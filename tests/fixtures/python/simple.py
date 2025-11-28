#!/usr/bin/env python3
"""Simple Python program for debugger testing."""

def add(a: int, b: int) -> int:
    """Add two numbers together."""
    result = a + b
    return result

def multiply(a: int, b: int) -> int:
    """Multiply two numbers together."""
    result = a * b
    return result

def calculate(x: int, y: int) -> dict:
    """Perform calculations and return results."""
    sum_result = add(x, y)
    product_result = multiply(x, y)
    return {
        "sum": sum_result,
        "product": product_result,
    }

def loop_example(n: int) -> int:
    """Loop n times and return the sum of indices."""
    total = 0
    for i in range(n):
        total += i
        print(f"Loop iteration {i}, total so far: {total}")
    return total

def main():
    """Main entry point."""
    print("Starting simple.py")

    # Test basic function calls
    result = add(5, 3)
    print(f"add(5, 3) = {result}")

    # Test nested function calls
    calc_result = calculate(4, 7)
    print(f"calculate(4, 7) = {calc_result}")

    # Test loop
    loop_result = loop_example(5)
    print(f"loop_example(5) = {loop_result}")

    print("Finished simple.py")

if __name__ == "__main__":
    main()
