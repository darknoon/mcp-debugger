#include <iostream>
#include <thread>
#include <vector>

int main() {
    // Shared, non-atomic counter (INTENTIONAL DATA RACE!)
    long long counter = 0;

    const int num_threads = 8;
    const long long iters_per_thread = 1'000'000;

    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    auto worker = [&counter, iters_per_thread](int id) {
        // Busy work to encourage interleaving
        for (long long i = 0; i < iters_per_thread; ++i) {
            // Intentional race: read-modify-write without synchronization
            counter++;                 // <-- Undefined behavior (data race)
            if ((i & 0xFFFF) == 0) {   // occasional yield to mix schedules
                std::this_thread::yield();
            }
        }
    };

    for (int t = 0; t < num_threads; ++t)
        threads.emplace_back(worker, t);

    for (auto& th : threads)
        th.join();

    const long long expected = num_threads * iters_per_thread;
    std::cout << "Expected: " << expected << "\n";
    std::cout << "Actual:   " << counter << "\n";
    std::cout << "(If Actual < Expected, you've observed a race condition.)\n";

    return 0;
}
