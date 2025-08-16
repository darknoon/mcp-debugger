"""SWE-bench dataset loader."""

from typing import Dict, List, Optional, Any
from datasets import load_dataset


class SWEBenchLoader:
    """Loads and manages SWE-bench examples."""
    
    def __init__(self, dataset_name: str = "princeton-nlp/SWE-bench_Lite"):
        """Initialize the loader with a dataset name."""
        self.dataset_name = dataset_name
        self.dataset = None
    
    def load_dataset(self) -> None:
        """Load the SWE-bench dataset."""
        print(f"Loading dataset: {self.dataset_name}")
        self.dataset = load_dataset(self.dataset_name, split="test")
        print(f"Loaded {len(self.dataset)} examples")
    
    def get_example(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific example by instance ID."""
        if not self.dataset:
            self.load_dataset()
        
        for example in self.dataset:
            if example["instance_id"] == instance_id:
                return example
        return None
    
    def get_all_examples(self) -> List[Dict[str, Any]]:
        """Get all examples from the dataset."""
        if not self.dataset:
            self.load_dataset()
        return list(self.dataset)
    
    def list_instance_ids(self) -> List[str]:
        """Get all available instance IDs."""
        if not self.dataset:
            self.load_dataset()
        return [example["instance_id"] for example in self.dataset]