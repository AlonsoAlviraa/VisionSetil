class CalibrationService:
    def __init__(self, num_bins: int = 10):
        self.num_bins = num_bins

    def compute_calibration(self, predictions: list[dict]) -> dict:
        """
        predictions is a list of dicts, each containing:
        - "confidence": float (0.0 to 1.0)
        - "correct": bool
        """
        if not predictions:
            return {
                "expected_calibration_error": 0.0,
                "bins": [],
                "overconfident_wrong_cases": []
            }

        bins = []
        total_cases = len(predictions)
        ece = 0.0
        overconfident_wrong_cases = []

        for i in range(self.num_bins):
            bin_min = i / self.num_bins
            bin_max = (i + 1) / self.num_bins
            
            # Find predictions in this bin
            # Include upper bound in the last bin
            if i == self.num_bins - 1:
                bin_preds = [p for p in predictions if bin_min <= p["confidence"] <= bin_max]
            else:
                bin_preds = [p for p in predictions if bin_min <= p["confidence"] < bin_max]

            count = len(bin_preds)
            if count == 0:
                continue

            mean_confidence = sum(p["confidence"] for p in bin_preds) / count
            correct_count = sum(1 for p in bin_preds if p["correct"])
            accuracy = correct_count / count

            bin_diff = abs(accuracy - mean_confidence)
            ece += (count / total_cases) * bin_diff

            # Track overconfident wrong cases
            # Define overconfident as confidence >= 0.7 and prediction is wrong
            for p in bin_preds:
                if p["confidence"] >= 0.7 and not p["correct"]:
                    overconfident_wrong_cases.append(p)

            bins.append({
                "bin": f"{bin_min:.1f}-{bin_max:.1f}",
                "count": count,
                "accuracy": round(accuracy, 4),
                "mean_confidence": round(mean_confidence, 4)
            })

        return {
            "expected_calibration_error": round(ece, 4),
            "bins": bins,
            "overconfident_wrong_cases": overconfident_wrong_cases
        }
