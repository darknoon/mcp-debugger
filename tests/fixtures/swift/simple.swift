// Simple Swift program for debugger testing
import Foundation

func add(_ a: Int, _ b: Int) -> Int {
    let result = a + b
    return result
}

func multiply(_ a: Int, _ b: Int) -> Int {
    let result = a * b
    return result
}

struct CalculationResult {
    let sum: Int
    let product: Int
}

func calculate(_ x: Int, _ y: Int) -> CalculationResult {
    let sumResult = add(x, y)
    let productResult = multiply(x, y)
    return CalculationResult(sum: sumResult, product: productResult)
}

func loopExample(_ n: Int) -> Int {
    var total = 0
    for i in 0..<n {
        total += i
        print("Loop iteration \(i), total so far: \(total)")
    }
    return total
}

func main() {
    print("Starting simple.swift")

    // Test basic function calls
    let result = add(5, 3)
    print("add(5, 3) = \(result)")

    // Test nested function calls
    let calcResult = calculate(4, 7)
    print("calculate(4, 7) = {sum: \(calcResult.sum), product: \(calcResult.product)}")

    // Test loop
    let loopResult = loopExample(5)
    print("loopExample(5) = \(loopResult)")

    print("Finished simple.swift")
}

main()
