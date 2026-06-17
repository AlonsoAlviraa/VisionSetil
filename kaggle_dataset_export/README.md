# VisionSetil Kaggle Dataset Export

This dataset was exported using `prepare_kaggle_dataset.py` and is formatted for use as a Kaggle Dataset.

## Structure
- `real_observations.json`: Contains expert-labeled labels with compatible relative image paths.
- `images/`: Folder containing all referenced image files.

## Kaggle Upload Steps
1. Go to [Kaggle](https://www.kaggle.com/) and click on "Datasets" -> "New Dataset".
2. Set the dataset title to `visionsetil-real-data` (or similar).
3. Drag and drop the contents of this folder (`real_observations.json` and the `images/` directory).
4. Click "Create".
5. Link this dataset to your Kaggle Notebook to execute the batch benchmark.
