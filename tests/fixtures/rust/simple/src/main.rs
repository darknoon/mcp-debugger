// Simple Rust program for debugger testing

fn add(a: i32, b: i32) -> i32 {
    let result = a + b;
    result
}

fn multiply(a: i32, b: i32) -> i32 {
    let result = a * b;
    result
}

struct CalculationResult {
    sum: i32,
    product: i32,
}

fn calculate(x: i32, y: i32) -> CalculationResult {
    let sum_result = add(x, y);
    let product_result = multiply(x, y);
    CalculationResult {
        sum: sum_result,
        product: product_result,
    }
}

fn loop_example(n: i32) -> i32 {
    let mut total = 0;
    for i in 0..n {
        total += i;
        println!("Loop iteration {}, total so far: {}", i, total);
    }
    total
}

fn string_example() {
    let greeting = "hello";
    let name = String::from("world");
    let combined = format!("{}, {}!", greeting, name);
    println!("{}", combined);
}

fn main() {
    println!("Starting simple.rs");

    // Test basic function calls
    let result = add(5, 3);
    println!("add(5, 3) = {}", result);

    // Test nested function calls
    let calc_result = calculate(4, 7);
    println!(
        "calculate(4, 7) = {{sum: {}, product: {}}}",
        calc_result.sum, calc_result.product
    );

    // Test loop
    let loop_result = loop_example(5);
    println!("loop_example(5) = {}", loop_result);

    // Test string handling
    string_example();

    println!("Finished simple.rs");
}
