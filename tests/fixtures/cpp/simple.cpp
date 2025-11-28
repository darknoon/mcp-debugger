// Simple C++ program for debugger testing
#include <iostream>
#include <map>
#include <string>

int add(int a, int b) {
    int result = a + b;
    return result;
}

int multiply(int a, int b) {
    int result = a * b;
    return result;
}

struct CalculationResult {
    int sum;
    int product;
};

CalculationResult calculate(int x, int y) {
    int sum_result = add(x, y);
    int product_result = multiply(x, y);
    return {sum_result, product_result};
}

int loop_example(int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
        total += i;
        std::cout << "Loop iteration " << i << ", total so far: " << total << std::endl;
    }
    return total;
}

int main() {
    std::cout << "Starting simple.cpp" << std::endl;

    // Test basic function calls
    int result = add(5, 3);
    std::cout << "add(5, 3) = " << result << std::endl;

    // Test nested function calls
    CalculationResult calc_result = calculate(4, 7);
    std::cout << "calculate(4, 7) = {sum: " << calc_result.sum
              << ", product: " << calc_result.product << "}" << std::endl;

    // Test loop
    int loop_result = loop_example(5);
    std::cout << "loop_example(5) = " << loop_result << std::endl;

    std::cout << "Finished simple.cpp" << std::endl;
    return 0;
}
