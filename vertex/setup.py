from setuptools import setup, find_packages

setup(
    name="trainer",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        "xgboost>=1.7.0",
        "pandas>=2.0.0",
        "scikit-learn>=1.2.0",
        "gcsfs>=2023.1.0"  # so pandas can read gs:// paths
    ],
)
