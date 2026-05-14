"""Math helpers."""


def add(a: float, b: float) -> float:
    return a + b


def sub(a: float, b: float) -> float:
    return a - b


def div(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("division by zero")
    return a / b
